## Generate narration WAV for aegis-splunk demo video using Windows SAPI.
## Aligned to scene timing in assemble-synthetic.py (~160s video):
##   0-5s   : title card     (lead silence)
##   5-13s  : plain dashboard (SOC context)
##   13-28s : scene 1  - MCP tool call
##   28-43s : scene 2  - 400 credit_balance_too_low
##   43-58s : scene 3  - L4 reclassifies
##   58-73s : scene 4  - L0 hedge + gpt-oss-120b
##   73-88s : scene 5  - MCP REST shim
##   88-103s: scene 6  - trust_posture degraded
##  103-118s: scene 7  - HEC indexed
##  118-133s: scene 8  - MTTR + Receipt
##  133-148s: scene 9  - trust_posture trusted
##  148-160s: closing card

Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 3
"Available English voices:"
$voices | ForEach-Object { "  - $($_.VoiceInfo.Name) ($($_.VoiceInfo.Culture.Name))" }

$preferredVoice = $voices | Where-Object { $_.VoiceInfo.Name -like '*Zira*' } | Select-Object -First 1
if (-not $preferredVoice) { $preferredVoice = $voices | Select-Object -First 1 }
if ($preferredVoice) {
  $synth.SelectVoice($preferredVoice.VoiceInfo.Name)
  "Using voice: $($preferredVoice.VoiceInfo.Name)"
}

$synth.Rate = -2
$synth.Volume = 100

$ssml = @'
<speak version="1.0" xml:lang="en-US" xmlns="http://www.w3.org/2001/10/synthesis">

  <break time="3500ms"/>
  <prosody rate="0.90">Two fourteen AM. Your agentic SOC analyst goes dark mid incident.</prosody>
  <break time="500ms"/>

  <prosody rate="0.90">aegis-splunk keeps it alive and emits every recovery as a Splunk event.</prosody>
  <break time="4000ms"/>

  <prosody rate="0.90">The agent fires splunk search. Splunk MCP Server receives the call and begins returning failed login data.</prosody>
  <break time="5500ms"/>

  <prosody rate="0.90">Anthropic returns four hundred. Credit balance too low.</prosody>
  <break time="1000ms"/>
  <prosody rate="0.90">Every major gateway — LiteLLM, OpenRouter, Portkey — passes this through silently. The status code is in the four-X-X range, so the fallback list never triggers. The agent goes dark.</prosody>
  <break time="1500ms"/>

  <prosody rate="0.90">aegis-splunk catches what gateways miss. The L four semantic layer inspects error dot type and the message text.</prosody>
  <break time="1000ms"/>
  <prosody rate="0.90">It reclassifies credit balance too low as fallback-eligible — even though the raw HTTP status is four hundred. This is the gap documented in LiteLLM issue twenty-four-three-twenty.</prosody>
  <break time="1500ms"/>

  <prosody rate="0.90">L zero hedge fires. Splunk hosted GPT OSS one twenty B wins the race in eight hundred milliseconds.</prosody>
  <break time="1000ms"/>
  <prosody rate="0.90">The primary attempt is canceled to bound cost. The analyst's question is answered on time.</prosody>
  <break time="4000ms"/>

  <prosody rate="0.90">Splunk MCP Server timed out. The REST shim engages automatically.</prosody>
  <break time="1000ms"/>
  <prosody rate="0.90">Same tool surface, same response shape, against Splunk's slash services slash search slash jobs endpoint. The agent never blinks.</prosody>
  <break time="3500ms"/>

  <prosody rate="0.90">Trust posture: degraded. Recovery is in progress.</prosody>
  <break time="1000ms"/>
  <prosody rate="0.90">Operator next action: allow read-only investigation. Require human approval before any remediation step. The SOC analyst stays in control.</prosody>
  <break time="2500ms"/>

  <prosody rate="0.90">Every recovery emits structured events to Splunk via HEC.</prosody>
  <break time="1000ms"/>
  <prosody rate="0.90">Sourcetypes aegis colon chaos and aegis colon MCP failover are indexed in the same Splunk instance the SOC team already watches. No second tool to learn.</prosody>
  <break time="2500ms"/>

  <prosody rate="0.90">Mean time to recovery: one point eight seconds.</prosody>
  <break time="800ms"/>
  <prosody rate="0.90">Layers fired: L zero, L four, MCP proxy. The Aegis Receipt is signed and attached to every response — a verifiable audit trail for compliance.</prosody>
  <break time="2500ms"/>

  <prosody rate="0.90">Trust posture: trusted. The agent is back.</prosody>
  <break time="800ms"/>
  <prosody rate="0.90">The splunk query field is pre-built. Copy and paste it directly into Splunk Search to find this exact recovery event in your index.</prosody>
  <break time="3000ms"/>

  <prosody rate="0.90">aegis-splunk.</prosody>
  <break time="600ms"/>
  <prosody rate="0.90">Hedge first, fallback second, continuously chaos-verified.</prosody>
  <break time="600ms"/>
  <prosody rate="0.90">MIT licensed.</prosody>
  <break time="2500ms"/>

</speak>
'@

$outFile = "$PSScriptRoot\narration.wav"
$synth.SetOutputToWaveFile($outFile)
$synth.SpeakSsml($ssml)
$synth.Dispose()

if (Test-Path $outFile) {
  $size = [math]::Round((Get-Item $outFile).Length / 1KB, 1)
  "Wrote $outFile ($size KB)"
} else {
  "FAILED to write $outFile"
  exit 1
}
