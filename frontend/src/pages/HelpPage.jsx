import { Link } from 'react-router-dom';
import { MapPin, Radar, Route, CheckCircle2 } from 'lucide-react';
export default function HelpPage() {
  return (
    <div className="guide-page">
      <div className="page-intro">
        <span className="eyebrow">A railway control room, explained</span>
        <h2>What should I do here?</h2>
        <p>
          You are simulating how a railway operator responds when a track fails or a junction closes. The
          application records the event, finds affected trains, and checks whether they can take another
          route.
        </p>
        <Link to="/#simulator" className="button primary">
          Create your first scenario →
        </Link>
      </div>
      <div className="guide-grid">
        {[
          [
            MapPin,
            '1. Choose what happened',
            'Open Operations. In the simulator, choose a track failure, station closure, or maintenance event. Pick a location and severity, then select Simulate & analyse.',
          ],
          [
            Radar,
            '2. Follow the backend',
            'The response view opens automatically. Its highlighted stage comes from the running backend. Animations indicate work in progress; a finished result appears only after the database saves it.',
          ],
          [
            Route,
            '3. Understand the outcome',
            'Affected journeys are trains whose remaining route encounters this event. A proposed diversion is an alternative path that passed availability checks. No affected journeys is a valid outcome.',
          ],
          [
            CheckCircle2,
            '4. Review your decision',
            'Compare the original and proposed routes and their delay estimates. Review & apply lets you confirm a reroute. The database checks it again before changing the journey.',
          ],
        ].map(([Icon, title, body]) => (
          <article key={title}>
            <Icon />
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <section className="guide-faq">
        <h2>Common questions</h2>
        {[
          [
            'Why does an open incident say analysis finished?',
            'The computer finished its assessment. The railway problem still exists. Applying a diversion changes a journey; it does not repair the track or reopen the station.',
          ],
          [
            'Why are there no affected trains?',
            'No remaining active journey passes through the chosen location. Imported map stations do not all have train schedules attached. Try an existing incident to inspect a populated result.',
          ],
          [
            'Why are there no alternate routes?',
            'The current network may not have another connected and available path. Existing closures can remove alternative paths. Waiting means an operator still needs to monitor the journey.',
          ],
          [
            'Is this tracking real trains?',
            'No. This is an educational simulation using a small railway dataset and some public station locations. It does not receive live railway telemetry or control real trains.',
          ],
          [
            'What is happening in the databases?',
            'PostgreSQL stores operational data and history. PostGIS handles location and geometry. Neo4j searches the projected network for paths. PostgreSQL validates each candidate before the dashboard shows it.',
          ],
          [
            'Why does progress sometimes jump between stages?',
            'Small analyses can finish a stage between two updates. The interface shows actual backend reports, so it does not slow work down just to display an animation.',
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
