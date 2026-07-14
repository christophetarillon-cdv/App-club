export const metadata = {
  title: 'Politique de confidentialité — CDCV',
};

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12 prose prose-sm">
        <h1 className="text-2xl font-bold text-gray-900">Politique de confidentialité — CDCV (Club de Danse Coublevie Voiron)</h1>
        <p className="text-gray-500">Dernière mise à jour : 14 juillet 2026</p>

        <p>
          Cette politique de confidentialité décrit comment l&apos;association Club de Danse Coublevie Voiron
          (« nous », « le Club ») collecte, utilise et protège les données personnelles des utilisateurs de
          l&apos;application CDCV (mobile et web).
        </p>

        <h2>1. Données collectées</h2>
        <p>Selon votre utilisation de l&apos;application, nous pouvons collecter :</p>
        <ul>
          <li>Identité : nom, prénom, date de naissance</li>
          <li>Coordonnées : adresse email, numéro de téléphone, adresse postale</li>
          <li>Informations d&apos;adhésion : cours suivis, statut de cotisation, plans de paiement</li>
          <li>Contenus : photos et vidéos de cours partagées par le Club, documents PDF (factures, certificats)</li>
          <li>Données techniques : identifiant de notification push (pour vous envoyer des alertes), historique de connexion</li>
        </ul>

        <h2>2. Utilisation des données</h2>
        <p>Ces données sont utilisées exclusivement pour :</p>
        <ul>
          <li>Gérer les adhésions et le suivi des cotisations</li>
          <li>Communiquer avec les adhérents (actualités, notifications, messages du Club)</li>
          <li>Partager les supports de cours (vidéos, audios, documents pédagogiques)</li>
          <li>Gérer le pointage aux séances (QR code)</li>
        </ul>

        <h2>3. Partage des données</h2>
        <p>
          Vos données ne sont ni vendues ni partagées avec des tiers à des fins commerciales. Elles peuvent être
          transmises à des prestataires techniques strictement nécessaires au fonctionnement de l&apos;application
          (hébergement Google Firebase, stockage Dropbox pour les documents), soumis à des obligations de
          confidentialité.
        </p>

        <h2>4. Conservation des données</h2>
        <p>
          Les données sont conservées pendant la durée de votre adhésion au Club, puis archivées ou supprimées
          conformément aux obligations légales applicables aux associations.
        </p>

        <h2>5. Vos droits</h2>
        <p>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et de
          portabilité de vos données. Pour exercer ces droits, contactez-nous à :{' '}
          <a href="mailto:contact@clubdedanse.net">contact@clubdedanse.net</a>.
        </p>

        <h2>6. Sécurité</h2>
        <p>
          Les données sont hébergées sur des infrastructures sécurisées (Google Firebase) avec authentification et
          contrôle d&apos;accès par rôle.
        </p>

        <h2>7. Contact</h2>
        <p>
          Pour toute question relative à cette politique de confidentialité :{' '}
          <a href="mailto:contact@clubdedanse.net">contact@clubdedanse.net</a>.
        </p>
      </div>
    </div>
  );
}
