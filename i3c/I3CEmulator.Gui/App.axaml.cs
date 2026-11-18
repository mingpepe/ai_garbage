using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using I3CEmulator.Gui.ViewModels;

namespace I3CEmulator.Gui;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var vm = new MainWindowViewModel();
            var win = new MainWindow { DataContext = vm };
            desktop.MainWindow = win;
            desktop.Exit += (_, _) => vm.Dispose();
        }

        base.OnFrameworkInitializationCompleted();
    }
}
