const data = [
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2021-06-01T00:00:00.000Z",
        "client": "60b7f2b8d8b7d00015e0f7d4",
        "status": "active",
        "Address": {
            "add": "Vijay Nagar",
            "city": "Indore",
            "state": "MP",
            "country": "India",
            "pincode": 452010
        },
        "product": "Surveillance System",
        "contactPerson": "Rahul",
        "contactNumber": 1234567890,
        "source": "Email",
        "service": null,
        "registerBy": "60b7f2b8d8b7d00015e0f7d4",
        "details": "Camera is not working."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-16T00:00:00.000Z",
        "client": "67615cf40ff7c4842f1a21f5",
        "status": "active",
        "Address": {
            "add": "Shivaji Nagar",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411038
        },
        "product": "Alleviz",
        "contactPerson": "Kishor",
        "contactNumber": 9011568505,
        "source": "SMS",
        "service": null,
        "registerBy": "676bcc6609ff8901464a176e",
        "details": "Software installation failed."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-17T00:00:00.000Z",
        "client": "67615cf40ff7c4842f1a21f5",
        "status": "active",
        "Address": {
            "add": "Shivaji Nagar",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411038
        },
        "product": "Alleviz",
        "contactPerson": "Kishor",
        "contactNumber": 9011568505,
        "source": "SMS",
        "service": null,
        "registerBy": "676bcc6609ff8901464a176e",
        "details": "User  unable to log in."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-18T00:00:00.000Z",
        "client": "676cefd209ff8901464a1918",
        "status": "active",
        "Address": {
            "add": "Wakad",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411028
        },
        "product": "CafeLive",
        "contactPerson": "Kiran",
        "contactNumber": 8788829928,
        "source": "WhatsApp",
        "service": null,
        "registerBy": "676bcc6609ff8901464a176e",
        "details": "Payment gateway issue."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-18T00:00:00.000Z",
        "client": "676cf01e09ff8901464a1922",
        "status": "active",
        "Address": {
            "add": "Wakad",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411028
        },
        "product": "WorksJoy Blu",
        "contactPerson": "Pratik",
        "contactNumber": 8788292837,
        "source": "WhatsApp",
        "service": null,
        "registerBy": "676bcc6609ff8901464a176e",
        "details": "Feature not working ."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-19T00:00:00.000Z",
        "client": "676cef6709ff8901464a190e",
        "status": "active",
        "Address": {
            "add": "Kothrud",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411032
        },
        "product": "IDS",
        "contactPerson": "Sagar",
        "contactNumber": 9011848594,
        "source": "WhatsApp",
        "service": null,
        "registerBy": "676cfe0a09ff8901464a1c08",
        "details": "System crash during operation."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-19T00:00:00.000Z",
        "client": "676cf01e09ff8901464a1922",
        "status": "active",
        "Address": {
            "add": "Kothrud", 
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411032
        },
        "product": "IDS",
        "contactPerson": "Sagar",
        "contactNumber": 9011848594,
        "source": "WhatsApp",
        "service": null,
        "registerBy": "676cfe0a09ff8901464a1c08",
        "details": "Data not syncing properly."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-20T00:00:00.000Z",
        "client": "676cefd209ff8901464a1918",
        "status": "active",
        "Address": {
            "add": "Wakad",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411028
        },
        "product": "CafeLive",
        "contactPerson": "Kiran",
        "contactNumber": 8788829928,
        "source": "WhatsApp",
        "service": null,
        "registerBy": "676bcc6609ff8901464a176e",
        "details": "Menu not updating."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-20T00:00:00.000Z",
        "client": "676cf01e09ff8901464a1922",
        "status": "active",
        "Address": {
            "add": "Wakad",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411028
        },
        "product": "WorksJoy Blu",
        "contactPerson": "Pratik",
        "contactNumber": 8788292837,
        "source": "WhatsApp",
        "service": null,
        "registerBy": "676bcc6609ff8901464a176e",
        "details": "User  interface not responsive."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-21T00:00:00.000Z",
        "client": "67615cf40ff7c4842f1a21f5",
        "status": "active",
        "Address": {
            "add": "Shivaji Nagar",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411038
        },
        "product": "Alleviz",
        "contactPerson": "Kishor",
        "contactNumber": 9011568505,
        "source": "SMS",
        "service": null,
        "registerBy": "676bcc6609ff8901464a176e",
        "details": "Notification not received."
    },
    {
        "company": "67613b840ff7c4842f1a20ff",
        "date": "2025-01-21T00:00:00.000Z",
        "client": "676cef6709ff8901464a190e",
        "status": "active",
        "Address": {
            "add": "Kothrud",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "pincode": 411032
        },
        "product": "IDS",
        "contactPerson": "Sagar",
        "contactNumber": 9011848594,
        "source": "WhatsApp",
        "service": null,
        "registerBy": "676cfe0a09ff8901464a1c08",
        "details": "Unable to access reports."
    }
];

module.exports = data;