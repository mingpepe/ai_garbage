using Avalonia.Controls;
using Avalonia.Interactivity;
using McuBusWpf.ViewModels;

namespace McuBusWpf;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        DataContext = new MainViewModel();
    }

    private void OnZoomInClick(object? sender, RoutedEventArgs e) => GtkViewer.ZoomIn();
    private void OnZoomOutClick(object? sender, RoutedEventArgs e) => GtkViewer.ZoomOut();
    private void OnZoomFitClick(object? sender, RoutedEventArgs e) => GtkViewer.ZoomFit();
}
