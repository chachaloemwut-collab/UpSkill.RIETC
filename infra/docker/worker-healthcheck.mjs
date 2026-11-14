// Docker HEALTHCHECK for the worker container. The worker image (node:*-slim) has no
// redis-cli/wget/curl, so we use node's built-in `net` to do a Redis PING. A worker whose
// process is alive but can't reach Redis is unhealthy (it can't consume jobs), which is
// exactly what `restart: unless-stopped` would NOT catch — this check does.
import net from "node:net";

const url = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0");
const socket = net.createConnection({ host: url.hostname, port: Number(url.port || 6379) });
socket.setTimeout(3000);

// With a password, send AUTH + PING back-to-back (Redis processes them in order over one
// connection). We exit 0 the moment a PONG shows up, and 1 on any error/timeout/no-PONG.
const command = url.password ? `AUTH ${decodeURIComponent(url.password)}\r\nPING\r\n` : "PING\r\n";
let received = "";

socket.on("connect", () => socket.write(command));
socket.on("data", (chunk) => {
  received += chunk.toString();
  if (received.includes("PONG")) {
    socket.destroy();
    process.exit(0);
  }
});
socket.on("error", () => process.exit(1));
socket.on("timeout", () => process.exit(1));
setTimeout(() => process.exit(1), 4000);
