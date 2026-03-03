$file = "client\src\pages\QuantReport.jsx"
$content = [System.IO.File]::ReadAllText("$PWD\$file", [System.Text.Encoding]::UTF8)

# 1. Add wfAssetsNTrigger state after wfRebalanceValue line
$content = $content -replace "(const \[wfRebalanceValue, setWfRebalanceValue\] = useState\(6\);)", `
    "`$1`r`n    const [wfAssetsNTrigger, setWfAssetsNTrigger] = useState(0); // 0 = whole portfolio, n = n assets"

# 2. Add assetsTrigger to fetchWalkforward API call
$content = $content -replace "(rebalanceValue: wfRebalanceValue,\r\n                    initialCapital: 10000,)", `
    "rebalanceValue: wfRebalanceValue,`r`n                    assetsTrigger: wfAssetsNTrigger,`r`n                    initialCapital: 10000,"

# 3. Add matrix params to fetchWalkforwardMatrix
$content = $content -replace "(metric: wfMatrixMetric,\r\n                    initialCapital: 10000,)", `
    "metric: wfMatrixMetric,`r`n                    wfMatrixRebalanceType,`r`n                    wfMatrixRebalanceRange,`r`n                    wfMatrixAssetsRange,`r`n                    initialCapital: 10000,"

# 4. Remove 3D KDE chart block (lines ~1524-1656) - find the block and remove it
$kdeSectionStart = "                                        {kde3dData && ("
$kdeSectionEnd = "                                        )}"
$startIdx = $content.IndexOf($kdeSectionStart)
if ($startIdx -ge 0) {
    # Find the matching closing at the correct nesting level
    $searchFrom = $startIdx + $kdeSectionStart.Length
    $depth = 1
    $i = $searchFrom
    while ($i -lt $content.Length -1 -and $depth -gt 0) {
        if ($content[$i] -eq '{' -and $i + 15 -lt $content.Length) { $depth++ }
        if ($content[$i] -eq '}' -and $depth -gt 0) { $depth-- }
        if ($depth -gt 0) { $i++ } else { break }
    }
    # Find the end of )} 
    $endOfBlock = $content.IndexOf("})", $i)
    if ($endOfBlock -ge 0) {
        $blockToRemove = $content.Substring($startIdx, $endOfBlock - $startIdx + 2)
        Write-Output "Found 3D block, length: $($blockToRemove.Length)"
        $content = $content.Replace($blockToRemove, "")
    }
}

# 5. Fix pairplot diagonal - change visible:false to type:'histogram'
$content = $content -replace "diagonal: \{ visible: false \}", "diagonal: { type: 'histogram' }"

# 6. Rename 'Ganancia de Cartera' to 'Ganancia' in the Rebalance Analysis dropdown
$content = $content -replace "Por Ganancia de Cartera \(%\)", "Por Ganancia (%)"

# 7. Rename 'Desv*o (%)' to 'Desajuste de Pesos (%)' in Matrix dropdown
$content = $content -replace "<option value=""deviation"">Desv.*o \(%\)<\/option>", "<option value=""deviation"">Desajuste de Pesos (%)</option>"

# 8. Rename 'Desvio Tolerado (%)' in label  
$content = $content -replace "'Desv.*o Tolerado \(%\)'", "'Desajuste Tolerado (%)'"

# 9. Add wfAssetsNTrigger input in Rebalance Analysis (after the value input div, before the button)
$triggerInput = @"
                                                     {wfRebalanceType === 'profit' && (
                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                             <label style={{ fontSize: '11px', color: '#666' }}>N&#xb0; Activos (0=Cartera)</label>
                                                             <input
                                                                 type="number"
                                                                 min={0}
                                                                 value={wfAssetsNTrigger}
                                                                 onChange={(e) => setWfAssetsNTrigger(parseInt(e.target.value) || 0)}
                                                                 style={{ width: '80px', padding: '6px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                                                                 title="0 = rebalancear cuando la cartera sube el % objetivo. N = cuando N activos individuales lo superan"
                                                             />
                                                         </div>
                                                     )}
"@

# Insert the asset trigger input before the Recalcular button in Rebalance Analysis
$content = $content -replace "(<button\s+onClick=\{fetchWalkforward\}\s+disabled=\{walkforwardLoading\})", ($triggerInput + "`$1")

# 10. Update Matrix Plot - replace heatmap with 2D/3D scatter
$oldPlot = @"
                                                            <Plot
                                                                data={[{
                                                                    x: wfMatrixData.x,
                                                                    y: wfMatrixData.y,
                                                                    z: wfMatrixData.z,
                                                                    type: 'heatmap',
                                                                    colorscale: 'Viridis',
                                                                    hoverongaps: false
                                                                }]}
                                                                layout={{
                                                                    title: 'Optimizacion de Rebalanceo 2D',
"@

$newPlot = @"
                                                            <Plot
                                                                data={wfMatrixRebalanceType === 'months' ? [{
                                                                    x: wfMatrixData.x,
                                                                    y: wfMatrixData.z && wfMatrixData.z[0] ? wfMatrixData.z[0] : [],
                                                                    type: 'scatter',
                                                                    mode: 'lines+markers',
                                                                    marker: { size: 8, color: '#10b981' },
                                                                    line: { color: '#10b981', width: 2 },
                                                                    name: wfMatrixMetric
                                                                }] : (wfMatrixData.y || []).map((assetVal, yi) => ({
                                                                    x: wfMatrixData.x || [],
                                                                    y: Array(wfMatrixData.x.length).fill(assetVal),
                                                                    z: (wfMatrixData.z && wfMatrixData.z[yi]) || [],
                                                                    type: 'scatter3d',
                                                                    mode: 'markers',
                                                                    marker: { size: 6, color: (wfMatrixData.z && wfMatrixData.z[yi]) || [], colorscale: 'Viridis', showscale: yi === 0 },
                                                                    name: assetVal + ' activos'
                                                                }))}
                                                                layout={{
                                                                    title: wfMatrixRebalanceType === 'months' ? 'Optimizacion por Meses' : 'Optimizacion 3D: Target vs Activos',
"@

# replace using normalized comparison
$normalOld = $oldPlot.Replace("`r`n", "`n").Trim()
$contentNorm = $content.Replace("`r`n", "`n")
if ($contentNorm.Contains($normalOld)) {
    Write-Output "Found heatmap plot block - replacing"
    $content = $contentNorm.Replace($normalOld, $newPlot.Replace("`r`n", "`n").Trim())
    $content = $content.Replace("`n", "`r`n")
} else {
    Write-Output "WARNING: heatmap plot block not found - searching for alternate"
    # Try partial match
    if ($content.Contains("type: 'heatmap'")) {
        Write-Output "Found heatmap type reference"
    }
}

[System.IO.File]::WriteAllText("$PWD\$file", $content, [System.Text.UTF8Encoding]::new($false))
Write-Output "Done! File saved."
