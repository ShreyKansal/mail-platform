import { domainToASCII } from 'node:url';

export interface Mailbox {
  /** `local@domain` with the domain in lowercase A-label form. */
  address: string;
  name?: string;
}

export class AddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AddressError';
  }
}

// RFC 5322 dot-atom (ASCII). Quoted local parts and SMTPUTF8 local parts are
// rejected for now; see docs/smtp/MIME.md ("Internationalized addresses").
const ATEXT = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]";
const DOT_ATOM = new RegExp(`^${ATEXT}+(?:\\.${ATEXT}+)*$`);
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export function normalizeDomain(input: string): string {
  const trimmed = input.trim().replace(/\.$/, '');
  if (!trimmed || CONTROL.test(trimmed)) throw new AddressError('domain is empty or contains control characters');
  const ascii = domainToASCII(trimmed.toLowerCase());
  if (!ascii) throw new AddressError(`invalid domain "${trimmed}"`);
  if (ascii.length > 253) throw new AddressError('domain is longer than 253 characters');
  const labels = ascii.split('.');
  if (labels.length < 2) throw new AddressError('domain must contain at least two labels');
  for (const label of labels) {
    if (!LABEL.test(label)) throw new AddressError(`invalid domain label "${label}"`);
  }
  const tld = labels[labels.length - 1] ?? '';
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) throw new AddressError(`invalid top-level domain "${tld}"`);
  return ascii;
}

export function parseAddress(input: string): string {
  if (CONTROL.test(input)) throw new AddressError('address contains control characters');
  const at = input.lastIndexOf('@');
  if (at <= 0 || at === input.length - 1) throw new AddressError(`"${input}" is not a valid email address`);
  const local = input.slice(0, at);
  const domain = input.slice(at + 1);
  if (local.length > 64) throw new AddressError('local part is longer than 64 characters');
  if (!DOT_ATOM.test(local)) {
    throw new AddressError(`"${input}" has an unsupported local part (quoted and non-ASCII local parts are not accepted)`);
  }
  const address = `${local}@${normalizeDomain(domain)}`;
  if (address.length > 254) throw new AddressError('address is longer than 254 characters');
  return address;
}

const NAME_ADDR = /^\s*(?:"((?:[^"\\]|\\.)*)"|([^<>"]*?))\s*<([^<>\s]+)>\s*$/;

/** Parses `addr`, `Name <addr>` or `"Quoted, Name" <addr>`. */
export function parseMailbox(input: string): Mailbox {
  if (typeof input !== 'string' || input.length === 0) throw new AddressError('address is required');
  if (input.length > 512) throw new AddressError('address is too long');
  if (CONTROL.test(input)) throw new AddressError('address contains control characters');
  const m = NAME_ADDR.exec(input);
  if (m) {
    const rawName = m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : (m[2] ?? '');
    const name = rawName.trim();
    const address = parseAddress(m[3] ?? '');
    return name ? { address, name } : { address };
  }
  if (/[<>"\s,;]/.test(input.trim())) throw new AddressError(`"${input}" is not a valid email address`);
  return { address: parseAddress(input.trim()) };
}

export const domainOf = (address: string): string => address.slice(address.lastIndexOf('@') + 1);
