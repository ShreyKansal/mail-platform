import brandLogo from '../assets/brand-logo.svg';
import brandLogoDark from '../assets/brand-logo-dark.svg';
import { BRAND } from '../brand';

/** The same brand artwork in the workspace header and authentication pages. */
export function BrandLogo({ width = 116 }: { width?: number }) {
  return <span className="brand-artwork" role="img" aria-label={BRAND.name}>
    <img className="brand-logo-light" src={brandLogo} width={width} height={width * 82 / 250} alt="" />
    <img className="brand-logo-dark" src={brandLogoDark} width={width} height={width * 82 / 250} alt="" />
  </span>;
}
