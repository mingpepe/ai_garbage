using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Interactivity;
using I3CEmulator.Gui.ViewModels;

namespace I3CEmulator.Gui;

public partial class MainWindow : Window
{
    private bool _syncingScroll;

    public MainWindow()
    {
        InitializeComponent();

        LaControl.ViewportMetricsChanged += OnLaViewportMetricsChanged;
        LaControl.CursorSampleSelected += idx =>
        {
            if (DataContext is MainWindowViewModel vm)
                vm.SelectedSampleIndex = idx;
        };

        DataContextChanged += (_, _) =>
        {
            if (DataContext is MainWindowViewModel vm)
            {
                vm.RequestScrollToSample += idx => LaControl.ScrollToSample(idx, center: true);
            }
        };
    }

    private void OnLaViewportMetricsChanged(double totalWidth, double viewportWidth)
    {
        _syncingScroll = true;
        try
        {
            double max = Math.Max(0, totalWidth - viewportWidth);
            LaHScroll.Maximum = max;
            LaHScroll.ViewportSize = viewportWidth;
            LaHScroll.Value = Math.Clamp(LaControl.ScrollOffsetX, 0, max);
        }
        finally
        {
            _syncingScroll = false;
        }
    }

    private void OnScrollBarValueChanged(object? sender, RangeBaseValueChangedEventArgs e)
    {
        if (_syncingScroll)
            return;

        LaControl.FollowLive = false;
        LaControl.ScrollOffsetX = e.NewValue;
        LaControl.InvalidateVisual();
    }

    private void OnZoomInClick(object? sender, RoutedEventArgs e) => LaControl.ZoomIn();
    private void OnZoomOutClick(object? sender, RoutedEventArgs e) => LaControl.ZoomOut();
    private void OnZoomFitClick(object? sender, RoutedEventArgs e) => LaControl.ZoomFit();

    private void OnChapterSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (sender is ListBox lb && lb.SelectedItem is ChapterItemViewModel ch && DataContext is MainWindowViewModel vm)
        {
            vm.JumpToChapter(ch);
        }
    }
}
