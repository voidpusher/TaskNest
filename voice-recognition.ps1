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
    $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
    $engine.SetInputToDefaultAudioDevice()
    $result = $engine.Recognize([TimeSpan]::FromSeconds($TimeoutSeconds))
    if (-not $result -or [string]::IsNullOrWhiteSpace($result.Text)) { exit 3 }
    [Console]::Write($result.Text.Trim())
  }
  finally {
    $engine.Dispose()
  }
}
catch {
  exit 4
}
