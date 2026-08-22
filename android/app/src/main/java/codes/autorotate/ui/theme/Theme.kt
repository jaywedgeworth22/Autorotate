package codes.autorotate.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = SpinAccent,
    onPrimary = SpinDark,
    background = Abyss,
    surface = Panel,
    onBackground = TextPrimary,
    onSurface = TextPrimary,
    outline = LineSubtle
)

@Composable
fun AutorotateTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
