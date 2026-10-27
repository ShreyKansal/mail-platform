import { Link, useRouteError } from 'react-router-dom';
import Button from './controls/Button';
import { ApiError } from '../lib/api';
import brandLogo from '../assets/brand-logo.svg';

/** Chunk/network/render failures never expose React Router's developer stack screen. */
export function RouteError() {
  const error = useRouteError();
  return <main className="route-failure">
    <Link to="/" aria-label="Home"><img src={brandLogo} alt="myMailer" width={116} /></Link>
    <section className="card route-failure-card" aria-labelledby="route-failure-title">
      <h1 id="route-failure-title">Unable to open this page</h1>
      <p>{error instanceof ApiError ? error.message : 'Reload the page to try again. If the problem continues, return to the overview.'}</p>
      <div><Button appearance="primary" onClick={()=>window.location.reload()}>Reload page</Button><Link to="/">Back to overview</Link></div>
    </section>
  </main>;
}
