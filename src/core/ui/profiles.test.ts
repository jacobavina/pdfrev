import { describe, it, expect, beforeEach } from 'vitest';
import { BUILTIN_PROFILES, parseLayoutSnapshot } from './profiles';
import { useUiStore } from '../../store/useUiStore';

describe('Perfiles de interfaz (ADR-0098)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.setState({
      profile: null,
      customLayout: null,
      ribbonTab: 'markup',
      leftOpen: true,
      leftTab: 'pages',
      rightPanel: null,
      markupsListOpen: false,
      viewMode: 'continuous',
      showRulers: false,
    });
  });

  it('cambia la disposición según el perfil: Takeoff abre mediciones y reglas, Field lo deja todo plegado', () => {
    useUiStore.getState().applyProfile('takeoff');
    expect(useUiStore.getState()).toMatchObject({
      profile: 'takeoff',
      ribbonTab: 'measure',
      rightPanel: 'measure',
      markupsListOpen: true,
      viewMode: 'single',
      showRulers: true,
    });
    useUiStore.getState().applyProfile('field');
    expect(useUiStore.getState()).toMatchObject({ profile: 'field', leftOpen: false, rightPanel: null, markupsListOpen: false, showRulers: false });
    useUiStore.getState().applyProfile('review');
    expect(useUiStore.getState()).toMatchObject({ ribbonTab: 'markup', rightPanel: 'properties', markupsListOpen: true, leftOpen: true });
  });

  it('guarda la disposición actual como perfil Custom y la recupera, también tras recargar', () => {
    expect(useUiStore.getState().customLayout).toBeNull();
    // Custom sin guardar no hace nada
    useUiStore.getState().applyProfile('custom');
    expect(useUiStore.getState().profile).toBeNull();
    useUiStore.setState({ ribbonTab: 'insert', leftOpen: false, rightPanel: 'toolchest', markupsListOpen: true, viewMode: 'single', showRulers: true });
    useUiStore.getState().saveCustomProfile();
    expect(useUiStore.getState()).toMatchObject({ profile: 'custom', customLayout: { ribbonTab: 'insert', rightPanel: 'toolchest' } });
    useUiStore.getState().applyProfile('review');
    useUiStore.getState().applyProfile('custom');
    expect(useUiStore.getState()).toMatchObject({ ribbonTab: 'insert', leftOpen: false, rightPanel: 'toolchest', showRulers: true });
    // Lo guardado sobrevive a la sesión
    const saved = parseLayoutSnapshot(JSON.parse(localStorage.getItem('rea-profile-custom')!));
    expect(saved).toMatchObject({ ribbonTab: 'insert', viewMode: 'single' });
    expect(localStorage.getItem('rea-profile')).toBe('custom');
  });

  it('una disposición guardada que no es válida se descarta y los perfiles de fábrica son completos', () => {
    expect(parseLayoutSnapshot(null)).toBeNull();
    expect(parseLayoutSnapshot({ ribbonTab: 'zzz' })).toBeNull();
    expect(parseLayoutSnapshot({ ...BUILTIN_PROFILES.review, rightPanel: 'otro' })).toBeNull();
    expect(parseLayoutSnapshot({ ...BUILTIN_PROFILES.review, leftOpen: 'si' })).toBeNull();
    for (const p of Object.values(BUILTIN_PROFILES)) expect(parseLayoutSnapshot(p)).toEqual(p);
  });
});
