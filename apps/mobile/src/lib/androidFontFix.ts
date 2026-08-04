import * as React from 'react';
import { Platform } from 'react-native';

/**
 * Correctif Android : police explicite sur tous les <Text>.
 *
 * Quand aucune `fontFamily` n'est precisee, Android utilise la police systeme.
 * Sur certains appareils (Samsung / One UI notamment), cette police est
 * *mesuree* avec des metriques differentes de celles du *rendu* : chaque texte
 * deborde alors de la boite calculee pour lui et sa fin est rognee, sans points
 * de suspension. Le symptome est proportionnel a la longueur du texte :
 * "Se deconnecter" -> "Se", "Calendrier" -> "Calendri", "il y a 4 h" -> "il y a 4",
 * et un message de chat perd son dernier mot ou sa derniere ligne.
 *
 * Preciser une famille explicite supprime la substitution et rend mesure et
 * rendu coherents. On surcharge l'export du module react-native (expose via un
 * accesseur) plutot que chaque ecran : cela couvre aussi les textes rendus par
 * la navigation (libelles d'onglets), inaccessibles autrement.
 *
 * A importer en tout premier dans app/_layout.tsx, avant tout rendu.
 */
if (Platform.OS === 'android') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require('react-native');
  const Original = RN.Text;

  const PatchedText = React.forwardRef((props: any, ref: any) =>
    React.createElement(Original, {
      ...props,
      ref,
      style: [{ fontFamily: 'sans-serif' }, props.style],
    }),
  );
  PatchedText.displayName = 'Text(androidFontFix)';

  Object.defineProperty(RN, 'Text', {
    configurable: true,
    get: () => PatchedText,
  });
}

export {};
