#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const removeLeading = p => p.replace(/^\//, '');
const removeTrailingNewline = p => p.replace(/\n$/, '');

const DEFAULT_SERVER_NAME = 'nas';

const { HOME, USER } = process.env;
const config_file = path.join(HOME, '.nas_mappings.json');

const readPassword = () => {
  return new Promise((res, rej) => {
    fs.readFile(`${HOME}/.naspass`, { encoding: 'utf8' }, (err, data) => {
      if (err) rej(err);
      res(removeTrailingNewline(data));
    });
  });
}

const checkExistsOrMake = (dir) => {
  return new Promise((res, rej) => {
    fs.stat(dir, (err, stats) => {
      if (err) rej(err);
      else if (!stats.isDirectory()) rej(`${dir} is not a directory`)
      else res();
    })
  })
}
const checkDirEmpty = (dir) => {
  return new Promise((res, rej) => {
    fs.readdir(dir, (err, files) => {
      if (err) rej(err);
      else if (files.length !== 0) rej();
      else res();
    })
  })
}

const mountWithOptions = ({ user, server, password }) => (path, destination) => {
  return new Promise((res, rej) => {
    const remoteDir = `//${user}:${password}@${server}/${path}`;
    const localDir = `${HOME}/${destination}`;
    console.log('mounting', remoteDir, 'to', localDir);
    const mountProcess = spawn('mount_smbfs', [remoteDir, localDir])
    checkExistsOrMake(localDir)
      .then(() => {
        checkDirEmpty(localDir)
          .then(() => {
            mountProcess.on('close', (code) => {
              if (code !== 0) rej(code)
              res(code);
            });
            mountProcess.stderr.on('data', (data) => {
              console.error(`${data}`);
            });
            mountProcess.stdout.on('data', (data) => {
              console.log(`${data}`);
            });
          })
          .catch(() => rej(`ERROR: Directory '${destination}' is not empty`));
      })
      .catch(rej);
  });
}

const mountMappingsFromFile = (file) => {
  const mappings = require(file);
  const user = mappings['nas.user'] || USER;
  const server = mappings['nas.server'] || DEFAULT_SERVER_NAME;
  return readPassword()
    .then((password) => {
      const doMount = mountWithOptions({ password, user, server });
      return (() => {
        const mountCommands = Object.keys(mappings.paths).map(p => doMount(removeLeading(p), removeLeading(mappings.paths[p])));
        return Promise.all(mountCommands);
      });
    });
}

const checkConfigFile = (config_file) => {
  return new Promise((res, rej) => {
    fs.access(config_file, fs.constants.R_OK, (err) => {
      if (err) rej(err)
      res(mountMappingsFromFile(config_file));
    })
  });
}

const logErrorAndExit = (err) => {
  console.error(err);
}

const p = checkConfigFile(config_file)
  .then(func => func())
  .catch(logErrorAndExit);

