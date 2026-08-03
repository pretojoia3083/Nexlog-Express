import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nexlog.express',
  appName: 'NEXLOG Express',
  webDir: 'out',
  backgroundColor: '#0F1319',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    BackgroundGeolocation: {
      provider: 'android',
      desiredAccuracy: 10,
      distanceFilter: 20,
      stationaryRadius: 50,
      interval: 15000,
      fastestInterval: 5000,
      stopOnTerminate: false,
      startOnBoot: true,
      debug: false,
      logLevel: 0,
      foregroundService: true,
      locationAuthorizationRequest: 'Always',
      backgroundPermissionRationale: {
        title: 'Rastreamento em segundo plano',
        message: 'Para rastrear sua rota mesmo com a tela desligada, o NEXLOG precisa da sua localizacao. Clique em Permitir.',
        positiveAction: 'Permitir',
        negativeAction: 'Agora nao',
      },
      notification: {
        title: 'NEXLOG',
        message: 'Rastreamento ativo',
        color: '#7A5BD1',
        priority: 1,
        sticky: true,
      },
    },
  },
};

export default config;
