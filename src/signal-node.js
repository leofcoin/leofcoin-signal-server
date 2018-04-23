import * as REPO from 'ipfs-repo';
import * as IPFSFactory from 'ipfsd-ctl';
import * as fs from 'crypto-io-fs';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { config } from 'repo-configs';
import star from './signal';
import chalk from 'chalk';
const { exists, write } = fs;
const networkPath = join(process.cwd(), process.env.network === 'olivia' ? '.leofcoin/olivia' : '.leofcoin')
const ipfsRepo = new REPO(networkPath);
const factory = IPFSFactory.create({type: 'go'});

if (process.platform === 'win32') {
  const readLine = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readLine.on('SIGINT', () => {
    process.emit('SIGINT');
  });
};

const initRepo = () => new Promise(async (resolve, reject) => {
  const { repo, spec } = await config({
    bootstrapFor: 'earth',
    sharding: true
  });
  repo.Addresses.Swarm = [
    '/ip4/0.0.0.0/tcp/4002',
    '/ip6/::/tcp/4002'
  ]
  repo.Addresses.Gateway = '/ip4/127.0.0.1/tcp/9090';
  const dataSpecPath = join(networkPath, 'datastore_spec')
  ipfsRepo.init(repo, async error => {
    if (error) reject(error);
    await write(dataSpecPath, JSON.stringify(spec));
    resolve();
  });
})

const prepareRepo = () => new Promise((resolve, reject) => {
  ipfsRepo.exists(async (error, exists) => {
    if (error) reject(error);
    else if (exists) resolve();
    else await initRepo();
    resolve();
  })
});

export const closeRepo = () => new Promise((resolve, reject) => {
  ipfsRepo.close(error => {
    if (error) reject(error);
    resolve()
  })
})

export const cleanRepo = () => new Promise(async (resolve, reject) => {
  console.log(`cleaning repo`);
  try {
    const arr = [
      join(networkPath, 'api'),
      join(networkPath, 'repo.lock')
    ]
    let count = 0;
    for (const path of arr) {
      count++;
      const fileExists = await exists(path)
      if (fileExists) unlinkSync(path)
      if (count === arr.length) {        
        resolve();
      }
    }
  } catch (error) {
    reject(error)
  }
});

const spawn = options => new Promise((resolve, reject) => {
  factory.spawn(options, (error, ipfsd) => {
    if (error) reject(error);
    resolve(ipfsd);    
  });
});

const start = (ipfsd, flags) => new Promise(async (resolve, reject) => {
  ipfsd.start(flags, error => {
    if (error) reject(error);
    ipfsd.api.id().then(({addresses}) => {
      console.group(chalk.green('ipfs daemon started and listening on'));
      addresses.forEach(address => console.log(chalk.cyan(address)))
      console.groupEnd();
      star(addresses[0], ipfsd.api.pubsub);
    }).catch(error => reject(error))
    resolve()
  });
});

export const IPFSNode = (flags = ['--enable-pubsub-experiment']) => new Promise(async (resolve, reject) => {
  const ipfstStartTime = Date.now();
  try {
    await prepareRepo();
    const ipfsd = await spawn({init: false, repoPath: networkPath, disposable: false});
    await start(ipfsd, flags);
    process.on('SIGINT', async () => {
      await ipfsd.stop();
      setTimeout(async () => {
        process.exit();
      }, 50);
    });
    console.log(`Daemon startup time: ${(Date.now() - ipfstStartTime) / 1000}s`);
    resolve(ipfsd);
      
  } catch (error) {
    console.log(error);
    if (error.message.includes('cannot acquire lock')) {      
      await cleanRepo();
    }
    return IPFSNode();
    // errorHandler(error);
  }
});
