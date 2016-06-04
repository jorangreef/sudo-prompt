var sudo = require('./');
var exec = require('child_process').exec;

function kill(end) {
  exec('sudo -k', end);
}
kill(
  function() {
    var options = {
      name: 'Sudo Prompt'
    };
    sudo.exec('sleep 10 && echo world', options,
      function(error, stdout, stderr) {
        console.log(error, stdout, stderr);
      }
    );
    sudo.exec('echo hello', options,
      function(error, stdout, stderr) {
        console.log(error, stdout, stderr);
      }
    );
  }
);
