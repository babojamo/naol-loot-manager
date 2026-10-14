param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
$projectRef = 'jpevnyalkjzfjtsqkagp'
$configPath = Join-Path $PSScriptRoot '../supabase/email-templates/auth-email-design.json'
$patch = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
# This helper can only update template HTML and subjects, never authentication or SMTP settings.
foreach ($property in $patch.PSObject.Properties) {
    if ($property.Name -notmatch '^mailer_(subjects_[a-z_]+|templates_[a-z_]+_content)$') { throw 'The template file contains a non-template setting.' }
}
if ($ValidateOnly) { Write-Host 'Template file validated. 13 designs; no credentials requested and no network requests made.'; exit 0 }
Write-Host "Apply the NAOL email design to Supabase project $projectRef."
Write-Host 'Your SMTP, redirects, authentication settings and notification enable/disable settings will be preserved.'
$secureToken = Read-Host 'Supabase personal access token (entered locally, never saved)' -AsSecureString
$tokenPointer = [IntPtr]::Zero
try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    $headers = @{ Authorization = "Bearer $plainToken" }
    $endpoint = "https://api.supabase.com/v1/projects/$projectRef/config/auth"
    $current = Invoke-RestMethod -Uri $endpoint -Method Get -Headers $headers
    $backup = [ordered]@{}
    foreach ($property in $current.PSObject.Properties) {
        if ($property.Name -match '^mailer_(subjects_|templates_)') { $backup[$property.Name] = $property.Value }
    }
    $backupDirectory = Join-Path $PSScriptRoot '../outputs/email-template-backups'
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    $backupPath = Join-Path $backupDirectory ("before-naol-design-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
    $backup | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $backupPath -Encoding utf8
    foreach ($kind in @('confirmation','invite','magic_link','email_change','recovery')) {
        $existing = $current.("mailer_templates_" + $kind + "_content")
        if ($existing -and $existing -cne $patch.("mailer_templates_" + $kind + "_content") -and ($existing -notmatch '{{\s*\.ConfirmationURL\s*}}' -or $existing -match '{{\s*\.TokenHash')) {
            throw "The existing $kind template uses custom authentication links. No templates were changed. Review the backup and preserve those links when applying the matching design manually."
        }
    }
    $body = [Text.Encoding]::UTF8.GetBytes(($patch | ConvertTo-Json -Depth 8 -Compress))
    $updated = Invoke-RestMethod -Uri $endpoint -Method Patch -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body
    $verified = Invoke-RestMethod -Uri $endpoint -Method Get -Headers $headers
    foreach ($property in $patch.PSObject.Properties) {
        if ($verified.($property.Name) -cne $property.Value) { throw "Could not verify template field $($property.Name). Check the Supabase Email Templates page." }
    }
    Write-Host 'All 13 email designs and subjects were saved and verified. No emails were sent.'
    Write-Host "Previous templates were backed up to $backupPath"
} finally {
    if ($headers) { $headers.Authorization = $null }
    $plainToken = $null
    $current = $null
    $updated = $null
    $verified = $null
    if ($tokenPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer) }
    $secureToken.Dispose()
}
