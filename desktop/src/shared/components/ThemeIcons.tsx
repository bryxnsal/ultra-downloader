export function IconThemeDark(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" stroke-width="1.2" />
      <rect x="1.5" y="1.5" width="4.5" height="9" fill="currentColor" />
    </svg>
  );
}

export function IconThemeLight(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square">
      <rect x="3.5" y="3.5" width="5" height="5" />
      <line x1="6" y1="0.5" x2="6" y2="2" />
      <line x1="6" y1="10" x2="6" y2="11.5" />
      <line x1="0.5" y1="6" x2="2" y2="6" />
      <line x1="10" y1="6" x2="11.5" y2="6" />
    </svg>
  );
}

export function IconThemeAuto(props: { class?: string }) {
  return (
    <svg class={props.class} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square">
      <rect x="1.5" y="1.5" width="9" height="7" />
      <line x1="4" y1="10.5" x2="8" y2="10.5" />
      <line x1="6" y1="8.5" x2="6" y2="10.5" />
      <rect x="4" y="3.5" width="4" height="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
