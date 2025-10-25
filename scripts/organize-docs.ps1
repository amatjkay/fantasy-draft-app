# Организация документации
# Переместить все MD файлы из корня в docs/

$files = @(
    "FINAL_REPORT.md",
    "IMPROVEMENTS.md", 
    "IMPROVEMENT_PLAN.md",
    "MONITOR_GUIDE.md",
    "NHL_API_STATUS.md",
    "OPTIMIZATION_SUMMARY.md",
    "PM2_GUIDE.md",
    "PM2_QUICKSTART.md",
    "PM2_README_SECTION.md",
    "QA_REVIEW_FINAL.md",
    "QUICKSTART.md",
    "REQUIREMENTS.md",
    "TECHNICAL_AUDIT.md",
    "TECHNICAL_SPEC.md"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "docs\" -Force
        Write-Host "✓ Moved $file to docs/"
    } else {
        Write-Host "✗ $file not found"
    }
}

Write-Host "`n✅ Documentation organized in docs/ folder"
