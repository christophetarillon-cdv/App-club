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

        <h2>Suppression directement depuis l&apos;application</h2>
        <p>
          La suppression est disponible en libre-service, directement dans l&apos;application :
        </p>
        <ol>
          <li>Ouvrez l&apos;application CDCV et connectez-vous</li>
          <li>Allez dans <strong>Mon profil</strong></li>
          <li>Dans la section <strong>Zone de danger</strong>, appuyez sur <strong>« Supprimer mon compte »</strong></li>
          <li>Confirmez la suppression</li>
        </ol>
        <p>La suppression est effective immédiatement.</p>

        <h2>Alternative par email</h2>
        <p>
          Si vous n&apos;avez plus accès à l&apos;application, vous pouvez également envoyer une demande par email à{' '}
          <a href="mailto:contact@clubdedanse.net">contact@clubdedanse.net</a> en précisant votre nom, prénom et
          l&apos;adresse email associée à votre compte CDCV. Votre demande sera traitée sous 30 jours maximum.</p>

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
