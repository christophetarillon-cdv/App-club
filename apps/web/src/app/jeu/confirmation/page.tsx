export default function ConfirmationPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">

        <div className="w-16 h-16 rounded-full bg-cardTeal flex items-center justify-center mx-auto mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Merci !</h1>
        <p className="text-gray-500 text-sm leading-relaxed">Tu es inscrit(e) au tirage au sort.</p>
        <p className="text-gray-400 text-xs italic mt-4">Le gagnant sera annoncé pendant l'événement.</p>

      </div>
    </div>
  );
}
