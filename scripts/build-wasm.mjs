import { mkdir } from 'node:fs/promises';
import asc from 'assemblyscript/asc';

await mkdir('assembly/build', { recursive: true });
await mkdir('public/wasm', { recursive: true });
for (const target of ['debug', 'release']) {
  const { error, stdout, stderr } = await asc.main([
    '--config',
    'asconfig.json',
    '--target',
    target,
  ]);
  if (stdout.toString()) process.stdout.write(stdout.toString());
  if (stderr.toString()) process.stderr.write(stderr.toString());
  if (error) throw error;
  console.info(`Built ${target} WebAssembly module.`);
}
