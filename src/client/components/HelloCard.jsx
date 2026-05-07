export default function HelloCard() {
  return (
    <div className="bg-slate-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-slate-600 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-rose-500">👋</span>
        <span className="font-medium text-slate-700">Hello Developer!</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Your React frontend is successfully connected and running.
      </p>
    </div>
  )
}

