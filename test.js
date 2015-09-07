var sudo = require('./');
var exec = require('child_process').exec;

function cleanup() {
  exec('sudo -k');
}

console.log('sudo.setName("Test")');
console.log('sudo.exec("echo hello")');
sudo.setName('Test');
sudo.exec('echo hello',
  function(error, stdout, stderr) {
    console.log('error: ' + error);
    console.log('stdout: ' + JSON.stringify(stdout));
    console.log('stderr: ' + JSON.stringify(stderr));
    cleanup();
    if (error) throw error;
    if (stdout !== 'hello\n') throw new Error('stdout != "hello\n"');
    if (stderr !== "") throw new Error('stderr != ""');
    console.log('OK');
  }
);
