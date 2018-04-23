import {IPFSNode} from './signal-node';
import express from 'express';
import { keccak } from 'leofcoin-hash';
import { encode } from 'bs58';
import { address } from 'ip';
const api = express()
const store = {};


if (process.argv.indexOf('olivia') !== -1) process.env.network = 'olivia';
else process.env.network = 'leofcoin';
process.env.PORT = process.env.PORT || 5555;
if (process.argv.indexOf('--no-front') === -1) {
  api.get('/', async (req, res) => {
    const netAddressHex = `${Buffer.from(process.env.network).toString('hex')}`
    const relaynethash = keccak(netAddressHex, 256).toString('hex');
    const template = `
      <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
        <h1>Leofcoin relay node</h1>
        <p>This node is meant for nodes with restricted network access</p>
        <br>      
        <p><strong>network: </strong>${process.env.network}</p>
        <p><strong>peerID: </strong>${store.id}</p>
        <p><strong>relaynethash: </strong> ${encode(relaynethash)}</p>
        <br>
        <p>Connect to '${store.address}' to join the network
      </div>
    `;
    const timeoutUntilAddress = () => {
      if (store.address) res.status(200).send(`
        <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
          <h1>Leofcoin relay node</h1>
          <p>This node is meant for nodes with restricted network access</p>
          <br>      
          <p><strong>network: </strong>${process.env.network}</p>
          <p><strong>peerID: </strong>${store.id}</p>
          <p><strong>relaynethash: </strong> ${encode(relaynethash)}</p>
          <br>
          <p>Connect to '${store.address}' to join the network
        </div>
      `);
      else setTimeout(() => {
        timeoutUntilAddress();
      }, 500);
    }
    timeoutUntilAddress()      
  });
  
  api.listen(process.env.PORT, () => console.log(`Server ready @ http://localhost:${process.env.PORT}!`));
}

(async () => {
  const ipfsd = await IPFSNode();
  const { id } = await ipfsd.api.id();
  store.id = id;
  store.address = `/ip4/${address()}/tcp/4001/ipfs/${id}`;
})();
