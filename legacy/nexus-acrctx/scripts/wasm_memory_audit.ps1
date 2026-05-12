# PowerShell script to audit Wasm modules for potential key leakage
# Requires wasm-tools (wasm-objdump) installed and accessible in PATH.
# Usage: ./wasm_memory_audit.ps1

$ErrorActionPreference = 'Stop'

# Directory containing compiled Wasm modules (adjust if needed)
$wasmDir = "g:/Quantchat/Nexus/packages/security/dist"

if (-not (Test-Path $wasmDir)) {
    Write-Error "Wasm directory not found: $wasmDir"
}

$reportPath = "g:/Quantchat/Nexus/scripts/wasm_audit_report.md"
"# Wasm Memory Audit Report`n" | Out-File -FilePath $reportPath -Encoding utf8

Get-ChildItem -Path $wasmDir -Filter "*.wasm" -Recurse | ForEach-Object {
    $wasmFile = $_.FullName
    "## File: $wasmFile`n" | Out-File -FilePath $reportPath -Append -Encoding utf8
    try {
        $dump = wasm-objdump -x $wasmFile 2>&1
        $dump | Out-File -FilePath $reportPath -Append -Encoding utf8
        # Simple heuristic: look for hex strings of length >= 32 (possible key material)
        $potentialKeys = ($dump -match "[0-9a-fA-F]{32,}")
        if ($potentialKeys) {
            "**Potential key-like patterns found**`n" | Out-File -FilePath $reportPath -Append -Encoding utf8
        } else {
            "No obvious key patterns detected.`n" | Out-File -FilePath $reportPath -Append -Encoding utf8
        }
    } catch {
        "Error processing ${wasmFile}: $($_)`n" | Out-File -FilePath $reportPath -Append -Encoding utf8
    }
}

Write-Host "Wasm memory audit completed. Report saved to $reportPath"
