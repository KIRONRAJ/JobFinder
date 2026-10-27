// string-tune is attribute-driven (a plain `string="…"` HTML attribute, not
// data-*), so React's built-in HTMLAttributes type doesn't know about it.
import 'react';

declare module 'react' {
  interface HTMLAttributes<T> {
    string?: string;
  }
}
