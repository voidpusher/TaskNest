param(
  [string]$CultureName = 'en-US',
  [ValidateRange(2, 30)][int]$TimeoutSeconds = 10
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
  Add-Type -AssemblyName System.Speech
  $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  if (-not $recognizers -or $recognizers.Count -eq 0) { exit 2 }

  $recognizer = $recognizers | Where-Object { $_.Culture.Name -eq $CultureName } | Select-Object -First 1
  if (-not $recognizer) { $recognizer = $recognizers | Select-Object -First 1 }

  $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($recognizer)
  try {
    $engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(5)
    $engine.BabbleTimeout = [TimeSpan]::FromSeconds(3)
    $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(900)
    $engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(1400)
    $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
    $engine.SetInputToDefaultAudioDevice()
    $result = $engine.Recognize([TimeSpan]::FromSeconds($TimeoutSeconds))
    if (-not $result -or [string]::IsNullOrWhiteSpace($result.Text)) { exit 3 }
    $alternatives = @($result.Alternates | Select-Object -First 3 | ForEach-Object {
      [ordered]@{ text = $_.Text.Trim(); confidence = [Math]::Round($_.Confidence, 4) }
    })
    $payload = [ordered]@{
      text = $result.Text.Trim()
      confidence = [Math]::Round($result.Confidence, 4)
      culture = $recognizer.Culture.Name
      alternatives = $alternatives
    }
    [Console]::Write(($payload | ConvertTo-Json -Compress -Depth 4))
  }
  finally {
    $engine.Dispose()
  }
}
catch {
  exit 4
}
