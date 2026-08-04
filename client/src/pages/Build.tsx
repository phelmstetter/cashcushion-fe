// Diagnostics page: shows when the running bundle was built and from which
// commit, so a deploy can be confirmed live (or stale) by comparing this
// against `git log` instead of guessing whether CI/CD actually ran.
export default function Build() {
  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '480px', margin: '48px auto' }}>
        <h2 style={{ marginTop: 0 }}>Build Info</h2>
        <dl style={{ fontSize: '14px', lineHeight: 1.6 }}>
          <dt style={{ color: '#888' }}>Built at</dt>
          <dd style={{ margin: '0 0 12px', fontFamily: 'monospace' }}>{__BUILD_TIME__}</dd>

          <dt style={{ color: '#888' }}>Commit</dt>
          <dd style={{ margin: '0 0 12px', fontFamily: 'monospace' }}>{__COMMIT_HASH__}</dd>

          <dt style={{ color: '#888' }}>Commit message</dt>
          <dd style={{ margin: 0 }}>{__COMMIT_MESSAGE__}</dd>
        </dl>
      </div>
    </div>
  );
}
