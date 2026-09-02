const { WebSocketServer } = require('ws');
const { createClient } = require('@deepgram/sdk');

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

function attachCallingAgentMediaStream(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/media-stream' });

  wss.on('connection', (twilioWs) => {
    console.log('📞 [CallingAgent] New call connected');

    let streamSid = null;
    let conversationHistory = [];
    let agentIsSpeaking = false;

    const dgConnection = deepgram.listen.live({
      model: 'nova-3',
      language: 'multi',
      encoding: 'mulaw',
      sample_rate: 8000,
      channels: 1,
      interim_results: true,
      endpointing: 300,
      smart_format: true,
    });

    dgConnection.on('open', () => console.log('🟢 [CallingAgent] Deepgram STT connected'));

    dgConnection.on('Results', async (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      if (!transcript) return;

      if (!data.is_final && agentIsSpeaking) {
        twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
        agentIsSpeaking = false;
      }

      if (data.is_final && transcript.trim().length > 0) {
        console.log('🗣️  [CallingAgent] Caller said:', transcript);
        await handleUserUtterance(transcript);
      }
    });

    dgConnection.on('error', (err) => console.error('[CallingAgent] Deepgram error:', err));

    twilioWs.on('message', (message) => {
      const msg = JSON.parse(message);
      switch (msg.event) {
        case 'start':
          streamSid = msg.start.streamSid;
          console.log('▶️  [CallingAgent] Stream started:', streamSid);
          speakToCall(process.env.CALLING_AGENT_GREETING || "Hi, how can I help you today?");
          break;
        case 'media':
          dgConnection.send(Buffer.from(msg.media.payload, 'base64'));
          break;
        case 'stop':
          console.log('⏹️  [CallingAgent] Call ended');
          dgConnection.finish();
          break;
      }
    });

    twilioWs.on('close', () => {
      console.log('🔌 [CallingAgent] WebSocket closed');
      dgConnection.finish();
    });

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
          console.error('[CallingAgent] Claude API error:', data.error);
          await speakToCall("Sorry, I'm having trouble right now. Could you repeat that?");
          return;
        }
        const reply = data.content?.[0]?.text || "Sorry, could you say that again?";
        conversationHistory.push({ role: 'assistant', content: reply });
        console.log('🤖 [CallingAgent] Agent reply:', reply);
        await speakToCall(reply);
      } catch (err) {
        console.error('[CallingAgent] LLM request failed:', err);
      }
    }

    async function speakToCall(text) {
      if (!streamSid) return;
      agentIsSpeaking = true;
      try {
        const ttsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=ulaw_8000`,
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
          console.error('[CallingAgent] ElevenLabs TTS error:', errText);
          agentIsSpeaking = false;
          return;
        }

        const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
        const chunkSize = 640;

        for (let i = 0; i < audioBuffer.length; i += chunkSize) {
          const chunk = audioBuffer.slice(i, i + chunkSize);
          twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: { payload: chunk.toString('base64') },
          }));
        }

        agentIsSpeaking = false;
      } catch (err) {
        console.error('[CallingAgent] TTS request failed:', err);
        agentIsSpeaking = false;
      }
    }
  });

  console.log('🎙️  [CallingAgent] Media stream WebSocket attached at /media-stream');
}

module.exports = { attachCallingAgentMediaStream };