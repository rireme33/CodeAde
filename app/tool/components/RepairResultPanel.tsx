type Props = {
  aiFixesSummary?: string[]
  repairLogs?: string[]
  canDownload?: boolean
}

export default function RepairResultPanel({
  aiFixesSummary = [],
  repairLogs = [],
  canDownload = false
}: Props) {
  return (
    <section style={{
      border:"1px solid #333",
      padding:20,
      borderRadius:12,
      marginTop:20
    }}>
      <h2>Repair Result</h2>

      <div style={{marginTop:20}}>
        <h3>AI Fixes Summary</h3>
        <ul>
          {aiFixesSummary.map((f,i)=>(
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>

      <div style={{marginTop:20}}>
        <h3>Repair Logs</h3>
        <pre style={{background:"#111",padding:10}}>
{repairLogs.join("\n")}
        </pre>
      </div>

      <div style={{marginTop:20}}>
        <button disabled={!canDownload}>
          Download fixed ZIP
        </button>
      </div>
    </section>
  )
}
