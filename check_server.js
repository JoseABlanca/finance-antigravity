const fetch = global.fetch;

async function checkServer() {
    console.log("Checking server endpoint...");
    try {
        const response = await fetch('http://localhost:3001/api/reports/trends?type=ANNUAL');
        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status}`);
            const text = await response.text();
            console.error("Response:", text);
        } else {
            const data = await response.json();
            console.log("Success! Data received:", JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("Fetch failed:", error.message);
        if (error.cause) console.error("Cause:", error.cause);
    }
}

checkServer();
