// Browser stub for Node.js built-in modules used by kokoro-js.
// kokoro-js checks `if (fs && Object.hasOwn(fs, 'readFile'))` before using
// these, so returning an empty object makes it take the browser/fetch path.
export default {};
export const readFile = undefined;
export const resolve = undefined;
export const join = undefined;
export const dirname = undefined;
