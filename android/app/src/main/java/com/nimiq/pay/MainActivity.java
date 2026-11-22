package com.nimiq.pay;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Before super, which creates the bridge and tells the web code which plugins it has.
        registerPlugin(CappedDownloadPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
