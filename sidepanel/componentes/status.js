/** Rótulo, cor do badge e texto do palco para cada estado da câmera. */
export const STATUS = {
  idle: { label: 'Parada', cor: 'gray', placeholder: 'Câmera parada' },
  requesting: { label: 'Iniciando…', cor: 'amber', placeholder: 'Solicitando acesso à câmera…' },
  active: { label: 'Ativa', cor: 'green', placeholder: '' },
  stopped: { label: 'Parada', cor: 'gray', placeholder: 'Transmissão encerrada' },
  error: { label: 'Erro', cor: 'red', placeholder: 'Não foi possível exibir o vídeo' }
};

export const statusDe = (state) => STATUS[state] || STATUS.idle;
