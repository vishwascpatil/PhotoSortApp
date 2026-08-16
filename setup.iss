[Setup]
AppId={{C6B5F482-1D5E-4B52-9653-3E49A24C9E45}
AppName=PhotoSort
AppVersion=1.0.0
AppPublisher=PhotoSort
AppPublisherURL=https://www.photosort.com
AppSupportURL=https://github.com/vishwascpatil/PhotoSortApp
AppUpdatesURL=https://github.com/vishwascpatil/PhotoSortApp/releases
DefaultDirName={autopf}\PhotoSort
DefaultGroupName=PhotoSort
DisableProgramGroupPage=yes
OutputDir=release
OutputBaseFilename=PhotoSort-Setup-1.0.0
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\PhotoSort.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\PhotoSort"; Filename: "{app}\PhotoSort.exe"
Name: "{group}\{cm:UninstallProgram,PhotoSort}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\PhotoSort"; Filename: "{app}\PhotoSort.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\PhotoSort.exe"; Description: "{cm:LaunchProgram,PhotoSort}"; Flags: nowait postinstall skipifsilent
