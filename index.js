var Node = {
  child: require('child_process'),
  crypto: require('crypto'),
  fs: require('fs'),
  os: require('os'),
  path: require('path'),
  process: process,
  util: require('util')
};

function attempt(attempts, command, options, end) {
  if (typeof attempts !== 'number' || Math.floor(attempts) !== attempts || attempts < 0) {
    return end(new Error('Attempts argument should be a positive integer.'));
  }
  // The -n (non-interactive) option prevents sudo from prompting the user for
  // a password. If a password is required for the command to run, sudo will
  // display an error message and exit.
  var childProcess = Node.child.exec('/usr/bin/sudo -n ' + command,
    function(error, stdout, stderr) {
      if (/sudo: /i.test(stderr)) {
        if (attempts > 0) return end(new Error('User did not grant permission.'));
        if (Node.process.platform === 'linux') {
          // Linux will probably use TTY tickets for sudo timestamps.
          // If so, we cannot easily extend the sudo timestamp for the user.
          // We prefer this since a single prompt can be used for multiple calls.
          // Instead, we have to use a separate prompt for each call.
          return linux(command, options, end);
        }
        prompt(options,
          function(error) {
            if (error) return end(error);
            attempt(++attempts, command, options, end); // Cannot use ++ suffix here.
          }
        );
      } else {
        end(error, stdout, stderr);
      }
    }
  );
  if (options.onChildProcess) options.onChildProcess(childProcess);
}

function copy(source, target, end) {
  source = escapeDoubleQuotes(Node.path.normalize(source));
  target = escapeDoubleQuotes(Node.path.normalize(target));
  var command = '/bin/cp -R -p "' + source + '" "' + target + '"';
  Node.child.exec(command, end);
}

function escapeDoubleQuotes(string) {
  return string.replace(/"/g, '\\"');
}

function exec() {
  if (arguments.length < 1 || arguments.length > 3) {
    throw new Error('Wrong number of arguments.');
  }
  var command = arguments[0];
  var options = {};
  var end = function() {};
  if (typeof command !== 'string') {
    throw new Error('Command should be a string.');
  }
  if (arguments.length === 2) {
    if (Node.util.isObject(arguments[1])) {
      options = arguments[1];
    } else if (Node.util.isFunction(arguments[1])) {
      end = arguments[1];
    } else {
      throw new Error('Expected options or callback.');
    }
  } else if (arguments.length === 3) {
    if (Node.util.isObject(arguments[1])) {
      options = arguments[1];
    } else {
      throw new Error('Expected options to be an object.');
    }
    if (Node.util.isFunction(arguments[2])) {
      end = arguments[2];
    } else {
      throw new Error('Expected callback to be a function.');
    }
  }
  if (/^sudo/i.test(command)) {
    return end(new Error('Command should not contain "sudo".'));
  }
  if (typeof options.name === 'undefined') {
    if (typeof name === 'string') {
      // If name is a string, it has been set and verified by setName.
      options.name = name;
    } else {
      var title = Node.process.title;
      if (validName(title)) {
        options.name = title;
      } else {
        return end(new Error('options.name must be provided (process.title is not valid).'));
      }
    }
  } else if (!validName(options.name)) {
    return end(new Error('options.name must be alphanumeric only (spaces are allowed).'));
  }
  if (typeof options.icns !== 'undefined') {
    if (typeof options.icns !== 'string') {
      return end(new Error('options.icns must be a string if provided.'));
    } else if (options.icns.trim().length === 0) {
      return end(new Error('options.icns must be a non-empty string if provided.'));
    }
  }
  if (typeof options.onChildProcess !== 'undefined') {
    if (typeof options.onChildProcess !== 'function') {
      return end(new Error('options.onChildProcess must be a function if provided.'));
    }
  }
  if (Node.process.platform !== 'darwin' && Node.process.platform !== 'linux') {
    return end(new Error('Platform not yet supported.'));
  }
  attempt(0, command, options, end);
}

function linux(command, options, end) {
  linuxBinary(
    function(error, binary) {
      if (error) return end(error);
      linuxExecute(binary, command, options, end);
    }
  );
}

function linuxBinary(end) {
  var index = 0;
  // We prefer gksudo over pkexec since it gives a nicer prompt:
  var paths = ['/usr/bin/gksudo', '/usr/bin/pkexec', '/usr/bin/kdesudo'];
  function test() {
    if (index === paths.length) {
      return end(new Error('Unable to find gksudo, pkexec or kdesudo.'));
    }
    var path = paths[index++];
    Node.fs.stat(path,
      function(error) {
        if (error) {
          if (error.code === 'ENOTDIR' || error.code === 'ENOENT') {
            return test();
          } else {
            return end(error);
          }
        } else {
          end(undefined, path);
        }
      }
    );
  }
  test();
}

function linuxExecute(binary, command, options, end) {
  var string = '';
  string += '"' + escapeDoubleQuotes(binary) + '" ';
  if (/gksudo/i.test(binary)) {
    string += '--preserve-env ';
    string += '--sudo-mode ';
    string += '--description="' + escapeDoubleQuotes(options.name) + '" ';
  } else if (/pkexec/i.test(binary)) {
    string += '--disable-internal-agent ';
  }
  string += command;
  var childProcess = Node.child.exec(string,
    function(error, stdout, stderr) {
      if (error && /Request dismissed|Command failed/i.test(error)) {
        error = new Error('User did not grant permission.');
      }
      end(error, stdout, stderr);
    }
  );
  if (options.onChildProcess) options.onChildProcess(childProcess);
}

function macApplet(target, options, end) {
  var source = Node.path.join(Node.path.dirname(target), 'sudo-prompt-applet.zip');
  Node.fs.writeFile(source, APPLET, 'base64',
    function(error) {
      if (error) return end(error);
      var command = 'unzip -o '; // Overwrite any existing applet.
      command += '"' + escapeDoubleQuotes(source) + '" ';
      command += '-d "' + escapeDoubleQuotes(target) + '"';
      Node.child.exec(command, end);
    }
  );
}

function macIcon(target, options, end) {
  if (!options.icns) return end();
  copy(options.icns, Node.path.join(target, 'Contents', 'Resources', 'applet.icns'), end);
}

function macOpen(target, options, end) {
  target = escapeDoubleQuotes(Node.path.normalize(target));
  var command = 'open -n -W "' + target + '"';
  Node.child.exec(command, end);
}

function macPrompt(hash, options, callback) {
  var temp = Node.os.tmpdir();
  if (!temp) return callback(new Error('Requires os.tmpdir() to be defined.'));
  if (!Node.process.env.USER) return callback(new Error('Requires env[\'USER\'] to be defined.'));
  var target = Node.path.join(temp, hash, options.name + '.app');
  function end(error) {
    remove(Node.path.dirname(target),
      function(errorRemove) {
        if (error) return callback(error);
        if (errorRemove) return callback(errorRemove);
        callback();
      }
    );
  }
  Node.fs.mkdir(Node.path.dirname(target),
    function(error) {
      if (error && error.code === 'EEXIST') error = undefined;
      if (error) return end(error);
      macApplet(target, options,
        function(error) {
          if (error) return end(error);
          macIcon(target, options,
            function(error) {
              if (error) return end(error);
              macPropertyList(target, options,
                function(error) {
                  if (error) return end(error);
                  macOpen(target, options, end);
                }
              );
            }
          );
        }
      );
    }
  );
}

function macPropertyList(target, options, end) {
  // Value must be in single quotes (not double quotes) according to man entry.
  // e.g. defaults write com.companyname.appname "Default Color" '(255, 0, 0)'
  // The defaults command will be changed in an upcoming major release to only
  // operate on preferences domains. General plist manipulation utilities will
  // be folded into a different command-line program.
  var path = escapeDoubleQuotes(Node.path.join(target, 'Contents', 'Info.plist'));
  var key = escapeDoubleQuotes('CFBundleName');
  var value = options.name + ' Password Prompt';
  if (/'/.test(value)) {
    return end(new Error('Value should not contain single quotes.'));
  }
  var command = 'defaults write "' + path + '" "' + key + '" \'' + value + '\'';
  Node.child.exec(command, end);
}

var name = null;

function prompt(options, end) {
  version(options,
    function(error, hash) {
      if (error) return end(error);
      if (!prompting.hasOwnProperty(hash)) prompting[hash] = [];
      prompting[hash].push(end);
      // Already waiting for user to enter password...
      // We expect that exec() may be called multiple times.
      // If a prompt is already pending, then we wait for the result of the prompt
      // and do not trigger another permission request dialog.
      if (prompting[hash].length > 1) return;
      function done(error) {
        // We must clear prompting queue before looping, otherwise sudo calls which
        // are synchronously issued by these callbacks may fail to be executed.
        var callbacks = prompting[hash];
        delete prompting[hash];
        for (var index = 0, length = callbacks.length; index < length; index++) {
          var callback = callbacks[index];
          callback(error);
        }
      }
      if (Node.process.platform === 'darwin') return macPrompt(hash, options, done);
      if (Node.process.platform === 'linux') return linuxPrompt(hash, options, done);
      end(new Error('Platform not supported (unexpected, should have been checked already).'));
    }
  );
}

var prompting = {};

function remove(target, end) {
  if (!target) return end(new Error('Target not defined.'));
  target = escapeDoubleQuotes(Node.path.normalize(target));
  var command = 'rm -rf "' + target + '"';
  Node.child.exec(command, end);
}

function setName(string) {
  // DEPRECATED to move away from a global variable towards a functional
  // interface. Otherwise using setName could have rare race conditions when
  // multiple calls need to use different names.
  if (!validName(string)) {
    throw new Error('Name must be alphanumeric only (spaces are allowed).');
  }
  name = string;
}

function touch(end) {
  // DEPRECATED to reduce the surface area of the interface.
  // Better to call exec() directly as this supports the options argument.
  // touch() may fail if process.title is not valid.
  // Depends on setName() which has also been deprecated.
  // This is a convenience method to extend the sudo session.
  // This uses existing sudo-prompt machinery.
  exec('echo touchingsudotimestamp', {},
    function(error, stdout, stderr) {
      if (error) return end(error);
      end(); // Do not pass stdout and stderr back to callback.
    }
  );
}

function validName(string) {
  // We use 70 characters as a limit to side-step any issues with Unicode
  // normalization form causing a 255 character string to exceed the fs limit.
  return /^[a-z0-9 ]+$/i.test(string) && string.trim().length > 0 && string.length < 70;
}

function version(options, end) {
  versionReadICNS(options,
    function(error, buffer) {
      if (error) return end(error);
      var hash = Node.crypto.createHash('SHA256');
      hash.update('sudo-prompt 2.0.0');
      hash.update(options.name);
      hash.update(buffer);
      end(undefined, hash.digest('hex').slice(-32));
    }
  );
}

function versionReadICNS(options, end) {
  if (!options.icns || Node.process.platform !== 'darwin') {
    return end(undefined, new Buffer(0));
  }
  // options.icns is supported only on Mac.
  Node.fs.readFile(options.icns, end);
}

module.exports.exec = exec;

// DEPRECATED:
module.exports.setName = setName;

// DEPRECATED:
module.exports.touch = touch;

// We used to expect that applet.app would be included as a file with this module.
// This caused copying issues when sudo-prompt was packaged within an asar file.
// We now store applet.app as a zip file in base64 within index.js instead.
// To recreate the zip file: zip -r ../applet.zip Contents (with applet.app as CWD)
// The zip file must not include applet.app as the root directory so that we
// can extract it directly to the target app directory.
var APPLET = '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';
