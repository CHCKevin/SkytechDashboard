// 由 web/src/lib/seats.js 的 SEAT_SPOTS 產生 web/src/styles/seats.css：npm run art:seats
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seatsCss } from '../../web/src/lib/seats.js';

const target = fileURLToPath(new URL('../../web/src/styles/seats.css', import.meta.url));
writeFileSync(target, seatsCss());
console.log(`已更新 ${target}`);
