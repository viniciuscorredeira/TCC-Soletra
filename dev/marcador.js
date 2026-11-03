/**
 * Soletra (modo dev) — marca que só existe no build dev.
 *
 * Os pontos de entrada dev a gravam no código de verdade, para o minificador não
 * a descartar. tests/builds.test.mjs procura este texto nas duas pastas: ele tem
 * de aparecer em dist-dev/ e nunca em dist/ — é a prova de que nada de dev/
 * vazou para a produção.
 */
export const MARCADOR_DEV = 'soletra:modo-dev';
