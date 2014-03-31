/*
 * Increase version number
 *
 * grunt push
 * grunt push:git
 * grunt push:patch
 * grunt push:minor
 * grunt push:major
 *
 * @author Vojta Jina <vojta.jina@gmail.com>
 * @author Mathias Paumgarten <mail@mathias-paumgarten.com>
 * @author Adam Biggs <email@adambig.gs>
 * @author Achim Sperling <achim.sperling@gmail.com>
 */
var semver = require('semver');
var exec = require('child_process').exec;

module.exports = function(grunt) {

  var DESC = 'Increment the version, commit, tag and push.';
  grunt.registerTask('push', DESC, function(versionType, incOrCommitOnly) {
    var opts = this.options({
      bumpVersion: true,
      files: ['package.json'],
      updateConfigs: [], // array of config properties to update (with files)
      releaseBranch: false,
      add: true,
      addFiles: ['.'], // '.' for all files except ingored files in .gitignore
      commit: true,
      commitMessage: 'Release v%VERSION%',
      commitFiles: ['-a'], // '-a' for all files
      createTag: true,
      tagName: 'v%VERSION%',
      tagMessage: 'Version %VERSION%',
      push: true,
      pushTo: 'origin',
      npm: false,
      npmTag: 'Release v%VERSION%',
      gitDescribeOptions: '--tags --always --abbrev=1 --dirty=-d'
    });

    if (incOrCommitOnly === 'bump-only') {
      grunt.verbose.writeln('Only incrementing the version.');

      opts.add = false;
      opts.commit = false;
      opts.createTag = false;
      opts.push = false;
    }

    if (incOrCommitOnly === 'commit-only') {
      grunt.verbose.writeln('Only commiting/taggin/pushing.');

      opts.bumpVersion = false;
    }

    if (incOrCommitOnly === 'push-release') {
      grunt.verbose.writeln('Pushing and publishing to NPM.');

      opts.npm = true;
    } else {
      opts.npm = false;
    }

    if (incOrCommitOnly === 'push-publish') {
      grunt.verbose.writeln('Publishing to NPM.');

      opts.bumpVersion = false;
      opts.add = false;
      opts.commit = false;
      opts.createTag = false;
      opts.push = false;
      opts.npm = true;
    }

    var done = this.async();
    var queue = [];
    var next = function() {
      if (!queue.length) {
        return done();
      }
      queue.shift()();
    };
    var runIf = function(condition, behavior) {
      if (condition) {
        queue.push(behavior);
      }
    };


    // MAKE SURE WE'RE ON A RELEASE BRANCH
    runIf(opts.releaseBranch && (opts.npm || opts.commit || opts.push), function() {
      exec('git rev-parse --abbrev-ref HEAD', function(err, stdout, stderr) {

        if (err || stderr) {
          grunt.fatal('Cannot determine current branch.');
        }

        var currentBranch = stdout.trim();
        var rBranches = (typeof opts.releaseBranch == 'string') ? [opts.releaseBranch] : opts.releaseBranch;

        for (var i = rBranches.length - 1; i >= 0; i--) {
          console.log('<'+rBranches[i] + "> - <" + currentBranch+'>');
          if (rBranches[i] == currentBranch) {
            return next();
          }
        }

        grunt.warn('The current branch is not in the list of release branches.');

        // Allow for --force
        next();

      });
    });
    

    var globalVersion; // when bumping multiple files
    var gitVersion;    // when bumping using `git describe`
    var VERSION_REGEXP = /(\bversion[\'\"]?\s*[:=]\s*[\'\"])([\da-z\.-]+)([\'\"])/i;


    // GET VERSION FROM GIT
    runIf(opts.bumpVersion && versionType === 'git', function(){
      exec('git describe ' + opts.gitDescribeOptions, function(err, stdout, stderr){
        if (err) {
          grunt.fatal('Can not get a version number using `git describe`');
        }
        gitVersion = stdout.trim();
        next();
      });
    });


    // BUMP ALL FILES
    runIf(opts.bumpVersion, function(){
      opts.files.forEach(function(file, idx) {
        var version = null;
        var content = grunt.file.read(file).replace(VERSION_REGEXP, function(match, prefix, parsedVersion, suffix) {
          version = gitVersion || semver.inc(parsedVersion, versionType || 'patch');
          return prefix + version + suffix;
        });

        if (!version) {
          grunt.fatal('Can not find a version to bump in ' + file);
        }

        grunt.file.write(file, content);
        grunt.log.ok('Version bumped to ' + version + (opts.files.length > 1 ? ' (in ' + file + ')' : ''));

        if (!globalVersion) {
          globalVersion = version;
        } else if (globalVersion !== version) {
          grunt.warn('Bumping multiple files with different versions!');
        }

        var configProperty = opts.updateConfigs[idx];
        if (!configProperty) {
          return;
        }

        var cfg = grunt.config(configProperty);
        if (!cfg) {
          return grunt.warn('Can not update "' + configProperty + '" config, it does not exist!');
        }

        cfg.version = version;
        grunt.config(configProperty, cfg);
        grunt.log.ok(configProperty + '\'s version updated');
      });
      next();
    });


    // when only commiting, read the version from package.json / pkg config
    runIf(!opts.bumpVersion, function() {
      if (opts.updateConfigs.length) {
        globalVersion = grunt.config(opts.updateConfigs[0]).version;
      } else {
        globalVersion = grunt.file.readJSON(opts.files[0]).version;
      }

      next();
    });


    // ADD
    runIf(opts.add, function() {
      exec('git add ' + opts.addFiles.join(' '), function(err, stdout, stderr) {
        if (err) {
          grunt.fatal('Can not add files:\n  ' + stderr);
        }
        grunt.log.ok('Added files: "' + opts.addFiles.join(' ') + '"');
        next();
      });
    });


    // COMMIT
    runIf(opts.commit, function() {
      var commitMessage = opts.commitMessage.replace('%VERSION%', globalVersion);

      exec('git commit ' + opts.commitFiles.join(' ') + ' -m "' + commitMessage + '"', function(err, stdout, stderr) {
        if (err) {
          grunt.fatal('Can not create the commit:\n  ' + stderr);
        }
        grunt.log.ok('Committed as "' + commitMessage + '"');
        next();
      });
    });


    // CREATE TAG
    runIf(opts.createTag, function() {
      var tagName = opts.tagName.replace('%VERSION%', globalVersion);
      var tagMessage = opts.tagMessage.replace('%VERSION%', globalVersion);

      exec('git tag -a ' + tagName + ' -m "' + tagMessage + '"' , function(err, stdout, stderr) {
        if (err) {
          grunt.fatal('Can not create the tag:\n  ' + stderr);
        }
        grunt.log.ok('Tagged as "' + tagName + '"');
        next();
      });
    });


    // PUSH CHANGES
    runIf(opts.push, function() {
      exec('git push ' + opts.pushTo + ' && git push ' + opts.pushTo + ' --tags', function(err, stdout, stderr) {
        if (err) {
          grunt.fatal('Can not push to ' + opts.pushTo + ':\n  ' + stderr);
        }
        grunt.log.ok('Pushed to ' + opts.pushTo);
        next();
      });
    });


    // PUBLISH CHANGES TO NPM
    runIf(opts.npm, function() {
      opts.npmTag.replace('%VERSION%', globalVersion);

      exec('npm publish --tag "' + opts.npmTag + '"', function(err, stdout, stderr) {
        if (err) {
          grunt.fatal('Publishing to NPM failed:\n  ' + stderr);
        }
        grunt.log.ok('Published to NPM with tag:' + opts.npmTag);
        next();
      });
    });

    next();
  });


  // ALIASES
  DESC = 'Increment the version only.';
  grunt.registerTask('push-only', DESC, function(versionType) {
    grunt.task.run('push:' + (versionType || '') + ':bump-only');
  });

  DESC = 'Add, commit, tag, push without incrementing the version.';
  grunt.registerTask('push-commit', DESC, 'push::commit-only');

  DESC = 'Bump version, add, commit, tag, push and publish to NPM.';
  grunt.registerTask('push-release', DESC, function(versionType) {
    grunt.task.run('push:' + (versionType || '') + ':push-release');
  });

  DESC = 'Just publish to NPM.';
  grunt.registerTask('push-publish', DESC, function(versionType) {
    grunt.task.run('push:' + (versionType || '') + ':push-publish');
  });
};

