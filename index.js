var Node = {
  child: require('child_process'),
  fs: require('fs'),
  os: require('os'),
  path: require('path'),
  process: process
};

function escapeDoubleQuotes(string) {
  return string.replace(/"/g, '\\"');
}

function validName(string) {
  return /^[a-z0-9 ]+$/i.test(string) && string.trim().length > 0;
}

var Name = undefined;

var Sudo = function(command, end) {
  if (Node.process.platform === 'darwin') return Sudo.Mac(command, end);
  end(new Error('Platform not yet supported.'));
  // TO DO: Add support for linux.
};

Sudo.Mac = function(command, end, count) {
  if (count === undefined) count = 0;
  if (count >= 2) return end(new Error('Permission denied after several password prompts.'));
  if (/^sudo/i.test(command)) return end(new Error('Command should not contain "sudo".'));
  // Run sudo in non-interactive mode (-n).
  Node.child.exec('/usr/bin/sudo -n ' + command,
    function(error, stdout, stderr) {
      if (/sudo: a password is required/i.test(stderr)) {
        Sudo.Mac.prompt(
          function(error) {
            if (error) return end(error);
            Sudo.Mac(command, end, ++count); // Cannot use ++ suffix here.
          }
        );
      } else if (!error && /^sudo:/i.test(stderr)) {
        end(new Error('Unexpected stderr from sudo command without corresponding error: ' + stderr));
      } else {
        end(error, stdout, stderr);
      }
    }
  );
};

Sudo.Mac.prompt = function(end) {
  var self = this;
  var title = Name || Node.process.title;
  if (!validName(title)) return end(new Error('Please use sudo.setName(string) to set your app name (process.title contains invalid characters).'));
  var temp = Node.os.tmpdir();
  if (!temp) return end(new Error('Requires os.tmpdir() to be defined.'));
  if (!Node.process.env.USER) return end(new Error('Requires env[\'USER\'] to be defined.'));
  if (self.prompting) {
    // Already waiting for user to enter password...
    // We expect that Sudo.exec may be called multiple times.
    // If a prompt is already pending, then we wait for the result of the prompt
    // and do not trigger another permission request dialog.
    self.prompting.push(end);
  } else {
    // Prompting user for password...
    self.prompting = [end];
    var finish = function(error) {
      var callbacks = self.prompting;
      self.prompting = false;
      for (var index = 0, length = callbacks.length; index < length; index++) {
        callbacks[index](error);
      }
    };
    // We copy osascript to a new tmp location using the title of this process as the basename.
    // We can then use this new binary to change the sudo timestamp, and OS X will use
    // the title of this process when asking the user for permission.
    Node.child.exec('which osascript',
      function(error, stdout, stderr) {
        if (error) return finish(error);
        var source = stdout.trim();
        var target = Node.path.join(temp, title);
        Node.fs.readFile(source,
          function(error, buffer) {
            if (error) return finish(error);
            Node.fs.writeFile(target, buffer,
              function(error) {
                if (error) return finish(error);
                Node.fs.chmod(target, 0755,
                  function(error) {
                    if (error) return finish(error);
                    // Set the sudo timestamp for our user:
                    var command = '"' + escapeDoubleQuotes(target) + '" -e \'do shell script "mkdir -p /var/db/sudo/$USER; touch /var/db/sudo/$USER" with administrator privileges\'';
                    Node.child.exec(command,
                      function(error, stdout, stderr) {
                        if (/user canceled/i.test(error)) error = new Error('User did not grant permission.');
                        if (error) return finish(error);
                        Node.fs.unlink(target, finish);
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  }
};

Sudo.Mac.prompting = false;

exports.exec = Sudo;

exports.touch = function(end) {
  // This is a convenience method to extend the sudo session.
  // This uses existing sudo-prompt machinery.
  Sudo('echo touchingsudotimestamp',
    function(error, stdout, stderr) {
      if (error) return end(error);
      end(); // Do not pass stdout and stderr back to callback.
    }
  );
};

exports.setName = function(string) {
  if (!validName(string)) throw new Error('Name must be alphanumeric only (spaces are allowed).');
  Name = string;
};
