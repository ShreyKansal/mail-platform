// Scriptable remote-MX simulator for local development and integration tests.
// NEVER deploy outside local/staging. Postfix routes *@mx-sim.test here.
//
// Behaviour is chosen by the recipient local part prefix:
//   accept*  -> 250 accepted
//   unknown* -> 550 5.1.1 mailbox does not exist        (hard bounce)
//   policy*  -> 550 5.7.1 rejected for policy reasons    (policy rejection)
//   full*    -> 452 4.2.2 mailbox full                   (soft / deferred)
//   defer*   -> 451 4.7.1 greylisted                     (deferred, then accepted after GREYLIST_SECONDS)
//   datafail*-> accepted at RCPT, 554 5.6.0 at end of DATA (content rejection)
import { SMTPServer } from 'smtp-server';

const port = Number(process.env.PORT ?? 2525);
const greylistSeconds = Number(process.env.GREYLIST_SECONDS ?? 60);
const firstSeen = new Map();
const delivered = [];

function rcptError(local) {
  if (local.startsWith('unknown')) return [550, '5.1.1 The email account that you tried to reach does not exist'];
  if (local.startsWith('policy')) return [550, '5.7.1 Message rejected due to local policy'];
  if (local.startsWith('full')) return [452, '4.2.2 Mailbox full'];
  if (local.startsWith('defer')) {
    const seen = firstSeen.get(local) ?? Date.now();
    firstSeen.set(local, seen);
    if (Date.now() - seen < greylistSeconds * 1000) return [451, '4.7.1 Greylisted, please try again later'];
  }
  return null;
}

const server = new SMTPServer({
  name: 'mx.mx-sim.test',
  banner: 'MX simulator',
  authOptional: true,
  disabledCommands: ['AUTH', 'STARTTLS'],
  size: 50 * 1024 * 1024,
  onRcptTo(address, _session, cb) {
    const local = address.address.split('@')[0].toLowerCase();
    const err = rcptError(local);
    if (!err) return cb();
    const e = new Error(err[1]);
    e.responseCode = err[0];
    cb(e);
  },
  onData(stream, session, cb) {
    let size = 0;
    stream.on('data', (c) => (size += c.length));
    stream.on('end', () => {
      const rcpts = session.envelope.rcptTo.map((r) => r.address);
      if (rcpts.some((r) => r.toLowerCase().startsWith('datafail'))) {
        const e = new Error('5.6.0 Message content rejected');
        e.responseCode = 554;
        return cb(e);
      }
      delivered.push({ at: new Date().toISOString(), from: session.envelope.mailFrom?.address, rcpts, size });
      if (delivered.length > 1000) delivered.shift();
      console.log(JSON.stringify({ event: 'accepted', from: session.envelope.mailFrom?.address, rcpts, size }));
      cb(null, 'OK accepted by simulator');
    });
  },
});

server.on('error', (err) => console.error(err));
server.listen(port, '0.0.0.0', () => console.log(`mx-simulator listening on ${port}`));
