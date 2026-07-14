export const metadata = {
  title: 'Suppression de compte — CDCV',
};

export default function SuppressionComptePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12 prose prose-sm">
        <h1 className="text-2xl font-bold text-gray-900">Suppression de compte — CDCV (Club de Danse Coublevie Voiron)</h1>

        <p>
          Vous pouvez à tout moment demander la suppression de votre compte et des données associées sur
          l&apos;application CDCV.
        </p>

        <h2>Comment demander la suppression</h2>
        <p>
          Envoyez une demande par email à{' '}
          <a href="mailto:contact@clubdedanse.net">contact@clubdedanse.net</a> en précisant :
        </p>
        <ul>
          <li>Votre nom et prénom (ainsi que ceux du ou des danseurs rattachés à votre compte, le cas échéant)</li>
          <li>L&apos;adresse email associée à votre compte CDCV</li>
        </ul>
        <p>Votre demande sera traitée sous 30 jours maximum.</p>

        <h2>Données supprimées</h2>
        <p>À réception de votre demande, sont supprimés :</p>
        <ul>
          <li>Votre compte de connexion (email, mot de passe)</li>
          <li>Vos informations personnelles (nom, prénom, date de naissance, coordonnées)</li>
          <li>Vos messages et échanges dans l&apos;application</li>
          <li>Votre identifiant de notification push</li>
        </ul>

        <h2>Données conservées</h2>
        <p>
          Conformément aux obligations légales et comptables applicables aux associations, certaines données liées
          à votre historique d&apos;adhésion et de cotisation peuvent être conservées à des fins d&apos;archivage
          légal, de manière anonymisée ou séparée de votre identité, pendant la durée requise par la loi.
        </p>

        <h2>Contact</h2>
        <p>
          Pour toute question : <a href="mailto:contact@clubdedanse.net">contact@clubdedanse.net</a>.
        </p>
      </div>
    </div>
  );
}
