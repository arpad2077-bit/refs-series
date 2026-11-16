# Локальный сервер без Node, Python и прав администратора.
# Запуск:  powershell -ExecutionPolicy Bypass -File .\serve.ps1
#
# Умеет:
#   • отдавать файлы сайта;
#   • принимать видео, выбранное в админке (POST /api/upload?name=...);
#   • отдавать видео частями (Range), чтобы перемотка в браузере работала.

param(
  [int]$Port = 8080,
  [switch]$Open,
  [switch]$OpenAdmin
)

$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$videosDir = Join-Path $root 'videos'
if (-not (Test-Path -LiteralPath $videosDir)) {
  New-Item -ItemType Directory -Path $videosDir | Out-Null
}

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.mp4'  = 'video/mp4'
  '.mkv'  = 'video/x-matroska'
  '.webm' = 'video/webm'
  '.mov'  = 'video/quicktime'
  '.avi'  = 'video/x-msvideo'
  '.m4v'  = 'video/mp4'
  '.srt'  = 'text/plain; charset=utf-8'
  '.vtt'  = 'text/vtt; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
}

# Порт: если занят — ищем следующий свободный.
$listener = $null
for ($try = 0; $try -lt 20; $try++) {
  $p = $Port + $try
  try {
    $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
    $candidate.Start()
    $listener = $candidate
    $Port = $p
    break
  } catch { continue }
}
if (-not $listener) {
  Write-Host ""
  Write-Host "  Не удалось занять порт $Port." -ForegroundColor Red
  Write-Host "  Закройте другие окна этого сервера и попробуйте снова." -ForegroundColor Red
  Write-Host ""
  Read-Host "  Нажмите Enter, чтобы закрыть"
  exit 1
}

$siteUrl = "http://localhost:$Port/"
$adminUrl = "http://localhost:$Port/admin.html#local"

Write-Host ""
Write-Host "  Сайт:    $siteUrl" -ForegroundColor Cyan
Write-Host "  Админка: $adminUrl" -ForegroundColor Cyan
Write-Host "  Корень:  $root"
Write-Host "  Видео:   $videosDir"
Write-Host ""
Write-Host "  Это окно закрывать нельзя, пока вы смотрите или редактируете сайт." -ForegroundColor Yellow
Write-Host "  Чтобы остановить: закройте окно или нажмите Ctrl+C." -ForegroundColor DarkGray
Write-Host ""

if ($Open) { Start-Process $siteUrl }
if ($OpenAdmin) { Start-Process $adminUrl }

# ---------- разбор запроса ----------

function Read-Head($stream) {
  $buf = New-Object System.Collections.Generic.List[byte]
  $state = 0
  while ($true) {
    $b = $stream.ReadByte()
    if ($b -lt 0) { break }
    $buf.Add([byte]$b)
    if ($b -eq 13) {
      if ($state -eq 0 -or $state -eq 2) { $state++ }
      else { $state = 0 }
    }
    elseif ($b -eq 10) {
      if ($state -eq 1) { $state = 2 }
      elseif ($state -eq 3) { break }
      else { $state = 0 }
    }
    else { $state = 0 }
    if ($buf.Count -gt 131072) { break }
  }
  return [System.Text.Encoding]::ASCII.GetString($buf.ToArray())
}

function Send-Raw($stream, [int]$status, [string]$reason, [string]$ctype, [byte[]]$body, [hashtable]$extra) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("HTTP/1.1 $status $reason`r`n")
  [void]$sb.Append("Content-Type: $ctype`r`n")
  [void]$sb.Append("Content-Length: $($body.Length)`r`n")
  [void]$sb.Append("Accept-Ranges: bytes`r`n")
  [void]$sb.Append("Cache-Control: no-store`r`n")
  if ($extra) {
    foreach ($k in $extra.Keys) { [void]$sb.Append("$k`: $($extra[$k])`r`n") }
  }
  [void]$sb.Append("Connection: close`r`n`r`n")
  $hb = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
  $stream.Write($hb, 0, $hb.Length)
  if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

function Send-Text($stream, [int]$status, [string]$reason, [string]$text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  Send-Raw $stream $status $reason 'text/plain; charset=utf-8' $bytes $null
}

function Send-Json($stream, [hashtable]$obj) {
  $json = $obj | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Send-Raw $stream 200 'OK' 'application/json; charset=utf-8' $bytes @{ 'Access-Control-Allow-Origin' = '*' }
}

function Get-SafePath([string]$path) {
  $rel = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $rel))
  if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $full
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  $stream = $client.GetStream()
  try {
    $head = Read-Head $stream
    if (-not $head) { continue }

    $lines = $head -split "`r`n"
    $reqLine = $lines[0]
    $headers = @{}
    for ($i = 1; $i -lt $lines.Length; $i++) {
      if ($lines[$i] -match '^([^:]+):\s*(.*)$') {
        $headers[$matches[1].Trim().ToLowerInvariant()] = $matches[2].Trim()
      }
    }

    $parts = $reqLine -split ' '
    if ($parts.Length -lt 2) { Send-Text $stream 400 'Bad Request' 'Bad request'; continue }
    $method = $parts[0].ToUpperInvariant()
    $rawPath = $parts[1]
    $path = $rawPath.Split('?')[0]
    $query = ''
    if ($rawPath.Contains('?')) { $query = $rawPath.Substring($rawPath.IndexOf('?') + 1) }
    $path = [System.Uri]::UnescapeDataString($path)

    # ---------- загрузка видео из админки ----------
    if ($method -eq 'POST' -and $path -eq '/api/upload') {
      $name = 'video.mp4'
      foreach ($pair in $query.Split('&')) {
        $kv = $pair.Split('=', 2)
        if ($kv[0] -eq 'name' -and $kv.Length -gt 1) { $name = [System.Uri]::UnescapeDataString($kv[1]) }
      }
      $name = ($name -replace '[^A-Za-z0-9._-]+', '-').Trim('-')
      if (-not $name) { $name = 'video.mp4' }
      if (-not $name.Contains('.')) { $name += '.mp4' }

      $length = 0L
      if ($headers.ContainsKey('content-length')) { $length = [long]$headers['content-length'] }
      if ($length -le 0) { Send-Text $stream 411 'Length Required' 'No Content-Length'; continue }

      $target = Join-Path $videosDir $name
      $n = 1
      while (Test-Path -LiteralPath $target) {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($name)
        $ext = [System.IO.Path]::GetExtension($name)
        $target = Join-Path $videosDir ("$base-$n$ext")
        $n++
      }

      $fs = [System.IO.File]::Create($target)
      try {
        $buf = New-Object byte[] 262144
        $remaining = $length
        while ($remaining -gt 0) {
          $want = [int][Math]::Min($buf.Length, $remaining)
          $n = $stream.Read($buf, 0, $want)
          if ($n -le 0) { break }
          $fs.Write($buf, 0, $n)
          $remaining -= $n
        }
      } finally { $fs.Dispose() }

      $written = (Get-Item -LiteralPath $target).Length
      $relPath = 'videos/' + [System.IO.Path]::GetFileName($target)
      Write-Host ("  + видео сохранено: {0} ({1:N1} МБ)" -f $relPath, ($written / 1MB)) -ForegroundColor Green
      Send-Json $stream @{
        ok   = $true
        path = $relPath
        size = $written
        url  = "/$relPath"
      }
      continue
    }

    if ($method -ne 'GET' -and $method -ne 'HEAD') {
      Send-Text $stream 405 'Method Not Allowed' 'Only GET/HEAD/POST'
      continue
    }

    if ($path -eq '/') { $path = '/index.html' }

    # ---------- сколько места занимают видео ----------
    if ($path -eq '/api/storage') {
      $total = 0L
      $count = 0
      Get-ChildItem -LiteralPath $videosDir -File -ErrorAction SilentlyContinue | ForEach-Object {
        $total += $_.Length
        $count++
      }
      $drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($root))
      Send-Json $stream @{
        ok          = $true
        videosBytes = $total
        videosCount = $count
        freeBytes   = $drive.AvailableFreeSpace
        totalBytes  = $drive.TotalSize
      }
      continue
    }

    $full = Get-SafePath $path
    if (-not $full) { Send-Text $stream 403 'Forbidden' 'Forbidden'; continue }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      Send-Text $stream 404 'Not Found' ("Not found: " + $path)
      continue
    }

    $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
    $ctype = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
    $size = (Get-Item -LiteralPath $full).Length
    $isVideo = $ctype.StartsWith('video/')

    if ($method -eq 'HEAD') {
      Send-Raw $stream 200 'OK' $ctype ([byte[]]@()) @{
        'Content-Range' = "bytes */$size"
      }
      continue
    }

    # ---------- видео: отдаём частями, чтобы работала перемотка ----------
    if ($isVideo) {
      $start = 0L
      $end = $size - 1
      $requestedEnd = $size - 1

      if ($headers.ContainsKey('range')) {
        $r = $headers['range']
        if ($r -match 'bytes=(\d*)-(\d*)') {
          if ($matches[1] -ne '') { $start = [long]$matches[1] }
          if ($matches[2] -ne '') { $end = [long]$matches[2] }
          $requestedEnd = $end
        }
      }
      if ($end -ge $size) { $end = $size - 1 }
      if ($start -gt $end) { $start = 0 }

      # ограничиваем кусок, чтобы сервер не блокировался надолго
      $chunk = 2MB
      if (($end - $start + 1) -gt $chunk) { $end = $start + $chunk - 1 }

      $len = [int]($end - $start + 1)
      $bytes = New-Object byte[] $len
      $fs = [System.IO.File]::Open($full, 'Open', 'Read', 'ReadWrite')
      try {
        $null = $fs.Seek($start, 'Begin')
        $read = 0
        while ($read -lt $len) {
          $n = $fs.Read($bytes, $read, $len - $read)
          if ($n -le 0) { break }
          $read += $n
        }
        if ($read -lt $len) { $bytes = $bytes[0..($read - 1)] }
      } finally { $fs.Dispose() }

      Send-Raw $stream 206 'Partial Content' $ctype $bytes @{
        'Content-Range' = "bytes $start-$end/$size"
      }
      continue
    }

    $body = [System.IO.File]::ReadAllBytes($full)
    Send-Raw $stream 200 'OK' $ctype $body $null
  }
  catch {
    try { Send-Text $stream 500 'Internal Server Error' ($_.Exception.Message) } catch { }
  }
  finally {
    try { $stream.Dispose() } catch { }
    try { $client.Close() } catch { }
  }
}
