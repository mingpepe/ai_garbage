using Avalonia.Controls;
using Avalonia.Interactivity;
using HidI2cSimulation.Simulation;
using HidI2cSimulation.Visualizer.ViewModels;

namespace HidI2cSimulation.Visualizer;

public partial class MainWindow : Window
{
    private readonly MainWindowViewModel _vm;

    public MainWindow()
    {
        InitializeComponent();
        _vm = new MainWindowViewModel();
        DataContext = _vm;

        ArchDiagram.AttachSession(_vm.Session);
        LogicAnalyzer.AttachCapture(_vm.Session.Capture);

        LogicAnalyzer.StatusChanged += status => _vm.LaCursorStatus = status;
        _vm.RequestZoomToTransaction += tx => LogicAnalyzer.ZoomToTransaction(tx);
        _vm.RequestHighlightComm += evt => ArchDiagram.HighlightEvent(evt);
        _vm.RequestTouchpadFeedback += (x, y, contact) => TouchpadCanvas.ShowExternalTouch(x, y, contact);

        TouchpadCanvas.TouchGenerated += (x, y, left, right) => _vm.TriggerTouch(x, y, left, right);
        TouchpadCanvas.TouchReleased += () => _vm.TriggerRelease();

        _vm.CommLogs.CollectionChanged += (_, _) =>
        {
            if (_vm.CommLogs.Count > 0)
                LstCommLogs.ScrollIntoView(_vm.CommLogs[^1]);
        };
    }

    private void OnNextStepClick(object? sender, RoutedEventArgs e) => _vm.ExecuteNextStep();

    private async void OnAutoRunClick(object? sender, RoutedEventArgs e) => await _vm.ToggleAutoRunAsync();

    private void OnResetAllClick(object? sender, RoutedEventArgs e)
    {
        _vm.ResetAll();
        LogicAnalyzer.ZoomFit();
    }

    private void OnSpeedChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (_vm == null) return;
        _vm.StepDelayMs = CmbSpeed.SelectedIndex switch
        {
            0 => 300,
            2 => 1400,
            _ => 700
        };
    }

    private void OnServiceIntClick(object? sender, RoutedEventArgs e) => _vm.ServicePendingInterrupt();

    private void OnTogglePowerClick(object? sender, RoutedEventArgs e) => _vm.ToggleDevicePower();

    private async void OnGestureTapClick(object? sender, RoutedEventArgs e) => await _vm.RunGestureTapAsync();

    private async void OnGestureDragClick(object? sender, RoutedEventArgs e) => await _vm.RunGestureDragAsync();

    private async void OnGestureScrollClick(object? sender, RoutedEventArgs e) => await _vm.RunGestureTwoFingerScrollAsync();

    private async void OnGestureRightClick(object? sender, RoutedEventArgs e) => await _vm.RunGestureRightClickAsync();

    private void OnApplyFeatureClick(object? sender, RoutedEventArgs e) => _vm.ApplyFeatureConfig();

    private void OnRunTestsClick(object? sender, RoutedEventArgs e) => _vm.RunComplianceTests();

    private void OnCommLogSelected(object? sender, SelectionChangedEventArgs e)
    {
        if (LstCommLogs.SelectedItem is CommLogRow row)
            _vm.SelectCommLog(row);
    }

    private void OnLaZoomInClick(object? sender, RoutedEventArgs e) => LogicAnalyzer.ZoomBy(0.6);

    private void OnLaZoomOutClick(object? sender, RoutedEventArgs e) => LogicAnalyzer.ZoomBy(1.6);

    private void OnLaZoomFitClick(object? sender, RoutedEventArgs e) => LogicAnalyzer.ZoomFit();

    private void OnClearLaClick(object? sender, RoutedEventArgs e)
    {
        _vm.ClearTraces();
        LogicAnalyzer.ZoomFit();
    }

    private void OnBookmarkClick(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is BusTransactionSummary tx)
            LogicAnalyzer.ZoomToTransaction(tx);
    }
}
