// services/exotelMediaStream.js
// ============================================================
// Handles Exotel's real-time Voicebot Applet WebSocket connection.
//
// ⚠️ IMPORTANT — PROTOCOL VERIFICATION NEEDED:
// This is built from Exotel's official documentation (event names:
// connected/start/media/dtmf/stop/clear — confirmed from docs.exotel.com),
// modeled closely on Twilio's near-identical format since Exotel's own
// docs describe the same event structure. HOWEVER, the exact sample
// rate and audio encoding were not 100% confirmed in documentation —
// this defaults to 8000Hz linear PCM (common for Indian telephony) but
// you MUST verify this against your first real test call's logs and
// adjust EXOTEL_SAMPLE_RATE / encoding below if audio sounds distorted.
// ============================================================

const { WebSocketServer } = require('ws');
const { createClient } = require('@deepgram/sdk');

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const SAMPLE_RATE = parseInt(process.env.EXOTEL_SAMPLE_RATE || '8000', 10);

function attachExotelMediaStream(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/exotel-media-stream' });

  wss.on('connection', (exotelWs) => {
    console.log('📞 [ExotelAgent] New call connected');

    let streamSid = null;
    let conversationHistory = [];
    let agentIsSpeaking = false;

    // --- STT: Deepgram, multilingual (English/Hindi/Marathi) ---
    const dgConnection = deepgram.listen.live({
      model: 'nova-3',
      language: 'multi',
      encoding: 'linear16', // ⚠️ VERIFY: Exotel may send mulaw or linear16 — adjust if STT accuracy is poor
      sample_rate: SAMPLE_RATE,
      channels: 1,
      interim_results: true,
      endpointing: 300,
      smart_format: true,
    });

    dgConnection.on('open', () => console.log('🟢 [ExotelAgent] Deepgram STT connected'));

    dgConnection.on('Results', async (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      if (!transcript) return;

      if (!data.is_final && agentIsSpeaking) {
        // Exotel's interruption event — per docs, "Clear" is used to stop playback
        exotelWs.send(JSON.stringify({ event: 'clear', stream_sid: streamSid }));
        agentIsSpeaking = false;
      }

      if (data.is_final && transcript.trim().length > 0) {
        console.log('🗣️  [ExotelAgent] Caller said:', transcript);
        await handleUserUtterance(transcript);
      }
    });

    dgConnection.on('error', (err) => console.error('[ExotelAgent] Deepgram error:', err));

    // --- Handle messages coming from Exotel ---
    exotelWs.on('message', (message) => {
      let msg;
      try {
        msg = JSON.parse(message);
      } catch (e) {
        console.error('[ExotelAgent] Failed to parse message:', message);
        return;
      }

      switch (msg.event) {
        case 'connected':
          console.log('🔌 [ExotelAgent] WebSocket handshake confirmed');
          break;

        case 'start':
          // ⚠️ VERIFY exact field path against real payload — this follows
          // the documented pattern (stream_sid at top level, call details nested under 'start')
          streamSid = msg.stream_sid || msg.streamSid;
          console.log('▶️  [ExotelAgent] Stream started:', streamSid, msg.start);
          speakToCall(process.env.CALLING_AGENT_GREETING || "Hi, how can I help you today?");
          break;

        case 'media':
          // ⚠️ VERIFY payload path — expected msg.media.payload (base64 audio)
          if (msg.media && msg.media.payload) {
            dgConnection.send(Buffer.from(msg.media.payload, 'base64'));
          }
          break;

        case 'dtmf':
          console.log('☎️  [ExotelAgent] DTMF received:', msg.dtmf);
          // Handle keypad input here if needed (e.g., menu navigation)
          break;

        case 'stop':
          console.log('⏹️  [ExotelAgent] Call ended');
          dgConnection.finish();
          break;

        default:
          console.log('[ExotelAgent] Unhandled event type:', msg.event);
      }
    });

    exotelWs.on('close', () => {
      console.log('🔌 [ExotelAgent] WebSocket closed');
      dgConnection.finish();
    });

    // ------------------------------------------------------------
    // LLM step — Claude, with multilingual system prompt
    // ------------------------------------------------------------
    async function handleUserUtterance(text) {
      conversationHistory.push({ role: 'user', content: text });

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 300,
            system: `You are a friendly customer support voice agent for an Indian company.
The caller may speak in English, Hindi, Marathi, or a natural mix of these (Hinglish).
ALWAYS reply in the SAME language(s) the caller just used. Keep replies short (1-2 spoken
sentences), warm, and conversational. Never use markdown, bullet points, or transliteration
notes — just natural spoken text in the appropriate script/language.`,
            messages: conversationHistory,
          }),
        });

        const data = await response.json();

        if (data.error) {
          console.error('[ExotelAgent] Claude API error:', data.error);
          await speakToCall("Sorry, I'm having trouble right now. Could you repeat that?");
          return;
        }

        const reply = data.content?.[0]?.text || "Sorry, could you say that again?";
        conversationHistory.push({ role: 'assistant', content: reply });
        console.log('🤖 [ExotelAgent] Agent reply:', reply);

        await speakToCall(reply);
      } catch (err) {
        console.error('[ExotelAgent] LLM request failed:', err);
      }
    }

    // ------------------------------------------------------------
    // TTS step — ElevenLabs, streamed back to Exotel
    // ------------------------------------------------------------
    async function speakToCall(text) {
      if (!streamSid) return;
      agentIsSpeaking = true;

      try {
        // ⚠️ VERIFY output format Exotel expects — trying linear PCM 16-bit at
        // matching sample rate. ElevenLabs supports 'pcm_16000', 'pcm_8000' etc.
        const outputFormat = SAMPLE_RATE === 16000 ? 'pcm_16000' : 'pcm_8000';

        const ttsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=${outputFormat}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
            }),
          }
        );

        if (!ttsResponse.ok) {
          const errText = await ttsResponse.text();
          console.error('[ExotelAgent] ElevenLabs TTS error:', errText);
          agentIsSpeaking = false;
          return;
        }

        const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
        // Per Exotel docs: "typically 100ms PCM chunks with 3200 bytes of raw audio"
        const chunkSize = 3200;

        for (let i = 0; i < audioBuffer.length; i += chunkSize) {
          const chunk = audioBuffer.slice(i, i + chunkSize);
          exotelWs.send(JSON.stringify({
            event: 'media',
            stream_sid: streamSid,
            media: { payload: chunk.toString('base64') },
          }));
        }

        agentIsSpeaking = false;
      } catch (err) {
        console.error('[ExotelAgent] TTS request failed:', err);
        agentIsSpeaking = false;
      }
    }
  });

  console.log('🎙️  [ExotelAgent] Media stream WebSocket attached at /exotel-media-stream');
}

module.exports = { attachExotelMediaStream };