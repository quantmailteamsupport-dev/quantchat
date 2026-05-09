const { Client } = require('ssh2');

const conn = new Client();

const password = 'kundan854410@';
const host = '20.249.208.224';
const username = 'kundan1792008';
const command = "ls -la && pwd && find . -maxdepth 2 -name '*QuantChat*' -o -name '*quantchat*'";

conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec(command, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: host,
  port: 22,
  username: username,
  password: password
});
