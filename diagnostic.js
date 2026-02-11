const net = require('net');
const http = require('http');

console.log('Starting diagnostics...');

// 1. Check TCP Connection
const checkPort = (port, host) => {
    return new Promise((resolve) => {
        console.log(`Checking TCP connection to ${host}:${port}...`);
        const socket = new net.Socket();
        socket.setTimeout(2000);

        socket.on('connect', () => {
            console.log(`✅ TCP Connection successful to ${host}:${port}`);
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            console.log(`❌ TCP Connection timed out to ${host}:${port}`);
            socket.destroy();
            resolve(false);
        });

        socket.on('error', (err) => {
            console.log(`❌ TCP Connection failed to ${host}:${port}: ${err.message}`);
            resolve(false);
        });

        socket.connect(port, host);
    });
};

// 2. Check HTTP Response
const checkHttp = (port, host) => {
    return new Promise((resolve) => {
        console.log(`Checking HTTP GET request to http://${host}:${port}/...`);
        const req = http.get(`http://${host}:${port}/`, (res) => {
            console.log(`✅ HTTP Response Headers: ${res.statusCode} ${res.statusMessage}`);
            res.on('data', () => { }); // Consume data
            resolve(true);
        });

        req.on('error', (err) => {
            console.log(`❌ HTTP Request failed: ${err.message}`);
            resolve(false);
        });

        req.setTimeout(2000, () => {
            console.log(`❌ HTTP Request timed out`);
            req.abort();
            resolve(false);
        });
    });
};

(async () => {
    const tcpLocalhost = await checkPort(3000, 'localhost');
    const tcpIP = await checkPort(3000, '127.0.0.1');

    if (tcpLocalhost || tcpIP) {
        await checkHttp(3000, 'localhost');
    } else {
        console.log('⚠️  Port 3000 seems closed. Ensure the server is running.');
    }

    console.log('Diagnostics complete.');
})();
