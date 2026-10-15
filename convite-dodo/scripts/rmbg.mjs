import { removeBackground } from '@imgly/background-removal-node';
import fs from 'fs';
const [,, inp, out, model] = process.argv;
const blob = await removeBackground('file://' + inp, { model: model || 'medium', output: { format: 'image/png', quality: 1 } });
fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
console.log('done', out);
