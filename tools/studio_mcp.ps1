$ErrorActionPreference = 'Stop'
$studioContent = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Roblox\RobloxStudio' -Name ContentFolder).ContentFolder
$studioMcp = [System.IO.Path]::GetFullPath((Join-Path $studioContent '..\StudioMCP.exe'))
if (-not (Test-Path -LiteralPath $studioMcp -PathType Leaf)) {
    throw 'StudioMCP.exe was not found. Update Roblox Studio and enable its MCP connection.'
}
& $studioMcp
exit $LASTEXITCODE
