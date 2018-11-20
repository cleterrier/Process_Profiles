// Autocorrelation script by Christophe Leterrier
// Calculates the autocorrelation of an intensity profile
// Used to detect periodicity in intensity line profiles
// March 2017
// As similar as possible to Zhong et al. eLife 2014 https://elifesciences.org/content/3/e0458114
// Modified April 2017 to be similar to d'Este et al. PNAS 2016 http://www.pnas.org/content/114/2/E191.abstract

importClass(Packages.java.awt.Color);
importClass(Packages.ij.gui.Overlay);
importClass(Packages.java.awt.Polygon);
importClass(Packages.java.lang.Float);

importClass(Packages.ij.IJ);
importClass(Packages.ij.gui.GenericDialog);
importClass(Packages.ij.plugin.frame.RoiManager);
importClass(Packages.ij.gui.ProfilePlot);
importClass(Packages.ij.measure.CurveFitter);
importClass(Packages.ij.gui.Plot);
importClass(Packages.ij.gui.Roi);
importClass(Packages.ij.process.ImageProcessor);
importClass(Packages.ij.ImageStack);
importClass(Packages.ij.ImagePlus);
importClass(Packages.ij.measure.ResultsTable);

var imp = IJ.getImage();
var stk = imp.getImageStack();
var stackName = imp.getTitle();
var stackID = imp.getID();
var stackDim = imp.getDimensions();
var stackScale = getScale(imp);
var pxSize = stackScale[0];
var pxUnit = stackScale[1];
var rm = RoiManager.getInstance();
var ra = rm.getRoisAsArray();
var nroi = rm.getCount();

IJ.log("\n*****************************************************\nAutocorrelation has started!\n*****************************************************\n");

// Default variables
var profileLength_Def = 0; // profile length in um
var corrLength_Def = 4; // autocorrelation span in um
var profileWidth_Def = 0.8; // profile width in um

var plotSizeX = 800;
var plotSizeY = 512;

// Get maximum length
var maxLengthPx = 0;
	
for (var r = 0; r < nroi; r++) {
	rm.select(imp, r);
	var roi = ra[r];
	var prof = new ProfilePlot(imp);
	var coord = prof.getProfile();
	if (coord.length > maxLengthPx) maxLengthPx = coord.length;
}

var maxLength =  maxLengthPx * pxSize;


// Options Dialog
var gd = new GenericDialog("AutoCorrelation Options");
gd.addMessage("Scale: " + pxSize + " " + pxUnit + " per pixel");
gd.addNumericField("Max profile length:", maxLength, 0, 3, pxUnit);
gd.addNumericField("Autocorrelation span:", corrLength_Def, 3, 5, pxUnit);
gd.addNumericField("Profile width (average):", profileWidth_Def, 3, 5, pxUnit);
gd.showDialog();
var profileLength = gd.getNextNumber();
var corrLength = gd.getNextNumber();
var profileWidth = gd.getNextNumber();

// Main part

if (gd.wasOKed()) {

	// Create ProfileFits basket
	var allProfileFits = new Array(nroi);

	// Width and length in pixels
	var profileWidthPx = Math.round(profileWidth / pxSize);
	var profileLengthPx = Math.round(profileLength / pxSize);
	var corrLengthPx = Math.round(corrLength / pxSize);

	// Output name (with parameters)
	var outName = stackName + "_AC(l" + corrLength + ",w" + profileWidth + ")";	

	for (var r = 0; r < nroi; r++) {

		var currPF = new ProfileFit;

	// Get the names, labels and indexes
		currPF.pStackName = stackName;
		currPF.pSliceNumber = rm.getSliceNumber(rm.getName(r));
		currPF.pSliceLabel = stk.getShortSliceLabel(currPF.pSliceNumber);
		currPF.pRoiNumber = r;
		currPF.pRoiName = rm.getName(r);

	// Get the raw profile with the specified width
		// pull the ROI
		var roi = ra[r];
		// get initial width
		var iw = roi.getStrokeWidth();
		rm.select(imp, r);
		
		if (profileWidth > 0) {
			// set desired witdh
			rm.runCommand("Set Line Width", profileWidthPx);
			// get profile values
			var profPlot = new ProfilePlot(imp);
			var rawY = profPlot.getProfile();
			// set back initial line width
			rm.runCommand("Set Line Width", iw);
		}

		else {
			var profPlot = new ProfilePlot(imp);
			var rawY = profPlot.getProfile();
		}

	// Get scaled X coordinates
		var rawX = new Array(rawY.length);
		for (var i = 0; i < rawY.length; i++) {
			rawX[i] = i * pxSize;
		}

	// Crop raw profiles to profileLength if necessary
		currPF.pCropX = new Array(profileLengthPx);
		currPF.pCropY = new Array(profileLengthPx);
		if (rawY.length > profileLengthPx) {
			for (i = 0; i < profileLengthPx; i++) {
			currPF.pCropX[i] = rawX[i];
			currPF.pCropY[i] = rawY[i];
			}
		}
		else {
			currPF.pCropX = rawX;
			currPF.pCropY = rawY;
		}

	// Get statistics of the profile
		currPF.pStats = getStats(currPF.pCropY);

	// Compute the autocorrelation
		var gxy = getAc(currPF.pCropY, corrLengthPx);

		var corrXpx = gxy[0];
		var corrY = gxy [1];

	// Get AC scaled X
		var corrX = new Array(corrXpx.length);
		for (var i = 0; i < corrX.length; i++) {
			corrX[i] = corrXpx[i] * pxSize;
		}

	// Assign autocorrelation coordinates
		currPF.pAcX = corrX;
		currPF.pAcY = corrY;


	// Get normalized autocorrelation coordinates
		currPF.pAcNY = normArray(currPF.pAcY, 1);

	// Get statistics of the normalized AC
		currPF.pAcStats = getStats(currPF.pAcNY);

	// Log the ProfileFit object
		IJ.log(printProfileFit(currPF));
	// Store the ProfileFit object
		allProfileFits[r] = currPF;

	}


// Output part

// Make profile stack

	// Create profiles stack
	var plotStacks = new ImageStack(plotSizeX, plotSizeY);

	// Looks for max and min of all plots to unify plot scale accross all features
	var plotMinAllY = getMinValue("pStats[1]", allProfileFits);
	var plotMaxAllY = getMaxValue("pStats[2]", allProfileFits);

	// Set plot range
	var plotMaxX = profileLength; // length is defined by crop length
	var plotMinY = plotMinAllY - (plotMaxAllY - plotMinAllY) * 0.3;
	var plotMaxY = plotMaxAllY + (plotMaxAllY - plotMinAllY) * 0.3;


	// For each ProfileFit, generate the profile plot, and add a slice to the Profiles image stack
	for (var r = 0; r < allProfileFits.length; r++) {

		// Pull the ProfileFit object
		var currPF = allProfileFits[r];

		// Create the profile plot
		var prfPlot = new Plot("Profiles", pxUnit, "intensity", convertArrayF(currPF.pCropX), convertArrayF(currPF.pCropY));
		prfPlot.setSize(plotSizeX, plotSizeY);
		prfPlot.setLimits(0, plotMaxX, plotMinY, plotMaxY);

		// Add profile
		prfPlot.setLineWidth(1);
		prfPlot.setColor(Color.RED);
		prfPlot.setLineWidth(1);
		prfPlot.draw();

		// Get ip
		var PlotP = prfPlot.getProcessor();
		// Add ip to profiles stack
		plotStacks.addSlice(currPF.pSliceLabel + ":" + currPF.pRoiName, PlotP);
	}

	// Create i+ from the profiles stack
	var plotImp = new ImagePlus(outName + "_Profiles", plotStacks);
	// Show the profiles stack
	plotImp.show();

// Make autocorrelation (AC) stack

	// Create AC stack
	var acStacks = new ImageStack(plotSizeX, plotSizeY);

	// Looks for max and min of all plots to unify plot scale accross all features
	var plotAcMinAllY = getMinValue("pAcStats[1]", allProfileFits);
	var plotAcMaxAllY = getMaxValue("pAcStats[2]", allProfileFits);

	// Set plot range
	var plotAcMaxX = corrLength/2; // length is defined by crop length
	var plotAcMinX = - corrLength/2;
	var plotAcMinY = plotAcMinAllY - (plotAcMaxAllY - plotAcMinAllY) * 0.3;
	var plotAcMaxY = plotAcMaxAllY + (plotAcMaxAllY - plotAcMinAllY) * 0.3;

	// For each ProfileFit, generate the autocorrelation plot, and add a slice to the Autocorrelations image stack
	for (var r = 0; r < allProfileFits.length; r++) {

		// Pull the ProfileFit object
		var currPF = allProfileFits[r];

		// Create the AC plot
		var acPlot = new Plot("Autocorrelations", pxUnit, "autocorr", convertArrayF(currPF.pAcX), convertArrayF(currPF.pAcNY));
		acPlot.setSize(plotSizeX, plotSizeY);
		acPlot.setLimits(plotAcMinX, plotAcMaxX, plotAcMinY, plotAcMaxY);

		// Add AC
		acPlot.setLineWidth(1);
		acPlot.setColor(Color.BLUE);
		acPlot.draw();

		// Get ip
		var acP = acPlot.getProcessor();
		// Add ip to profiles stack
		acStacks.addSlice(currPF.pSliceLabel + ":" + currPF.pRoiName, acP);
	}

	// i+ from the AC stack
	var acImp = new ImagePlus(outName + "_Autocorr", acStacks);
	// Show the AC stack
	acImp.show();


// Make Results Table

	// Initialize the Results Table
	var rt = new ResultsTable();
	var row = -1;

	for (var r = 0; r < allProfileFits.length; r++) {

		var CurrPF = allProfileFits[r];

		//log to Results Table
		rt.incrementCounter();
		row++;

		rt.setValue("Stack", row, CurrPF.pStackName);
		rt.setValue("Slice #", row, "" + CurrPF.pSliceNumber);
		rt.setValue("Slice", row, CurrPF.pSliceLabel);
		rt.setValue("Roi #", row, "" + CurrPF.pRoiNumber);
		rt.setValue("Roi", row, CurrPF.pRoiName);
		rt.setValue("Length", row, CurrPF.pStats[0] * pxSize);
		rt.setValue("Min", row, CurrPF.pStats[1]);
		rt.setValue("Max", row, CurrPF.pStats[2]);
		rt.setValue("Mean", row, CurrPF.pStats[3]);
		rt.setValue("SD", row, CurrPF.pStats[4]);
		rt.setValue("AC Length", row, CurrPF.pAcStats[0] * pxSize);
		rt.setValue("AC Min", row, CurrPF.pAcStats[1]);
		rt.setValue("AC Max", row, CurrPF.pAcStats[2]);
		rt.setValue("AC Mean", row, CurrPF.pAcStats[3]);
		rt.setValue("AC SD", row, CurrPF.pAcStats[4])

	}

	// show the Results Table
	rt.show(outName + "_Results");
}


// Make Profiles table
		
		// Initialize the Profiles Table
		var pt = new ResultsTable();

		// X values
		var Profile = allProfileFits[0];
		for (var p = 0; p < maxLengthPx; p++) {	
			pt.setValue("Scaled X", p, p * pxSize);
		}
		
		for (var r = 0; r < allProfileFits.length; r++) {
	
			var Profile = allProfileFits[r];
			
			for (p = 0; p < Profile.pCropY.length; p++) {
				pt.setValue(Profile.pSliceLabel + ":" + Profile.pRoiName, p, Profile.pCropY[p]);
			}
			for (p = Profile.pCropY.length; p < maxLengthPx; p++) {
				pt.setValue(Profile.pSliceLabel + ":" + Profile.pRoiName, p, Number.NaN);
			}
		}
		// show the Profiles Table
		pt.show(outName + "_Profiles");


// Make AC table
		
		// Initialize the AC Table
		var act = new ResultsTable();

		// X values	
		var Profile = allProfileFits[0];
		
		for (var p = 0; p < Profile.pAcX.length; p++) {	
			act.setValue("Scaled X", p, Profile.pAcX[p]);
		}
		
		for (var r = 0; r < allProfileFits.length; r++) {
	
			var Profile = allProfileFits[r];
			
			for (var p = 0; p < Profile.pAcNY.length; p++) {
				act.setValue(Profile.pSliceLabel + ":" + Profile.pRoiName, p, Profile.pAcNY[p]);
			}
		}
		// show the Profiles Table
		act.show(outName + "_Autocorr");




// Functions



// Utility to convert a javascript array into a java float array
function convertArrayF(arr) {
	var jArr = java.lang.reflect.Array.newInstance(java.lang.Float.TYPE, arr.length);
	for (var i = 0; i < arr.length; i++) {
   		jArr[i] = arr[i];
 	}
  	return jArr;
}

// Get the pixel size and units
function getScale(imp){
	var cal=imp.getCalibration();
	var scale=cal.getX(1);
	var unit=cal.getXUnit();
	return [scale , unit];
}

// Compute statistics on an array: length, max, mean and sd
function getStats(ar) {
	var min = ar[0];
	var max = ar[0];
	var sum = ar[0];
	for (var a = 1; a <ar.length; a++) {
		if (ar[a] < min) min = ar[a];
		if (ar[a] > max) max = ar[a];
		sum += ar[a];
	}
	mean = sum / ar.length;
	var res = 0;
	for (var a = 0; a < ar.length; a++) {
		res += ((mean - ar[a]) * (mean - ar[a]));
	}
	var sd = Math.sqrt(res / (ar.length - 1));
	return [ar.length, min, max, mean, sd];
}

// Compute the autocorrelation of an array
function getAc(a, s) {

	if (s == 0) s = a.length;
	
	var aStats = getStats(a);
	var amean = aStats[3];

	var avar = new Array(a.length);
	for (var i = 0; i < avar.length; i++) {
		avar[i] = a[i] - amean;
	}

	var mid = Math.floor(s / 2);
	var gx = new Array(2 * mid + 1);
	var gy = new Array(2 * mid + 1);
	for (var i = - mid; i < mid + 1; i++) {
		gx[mid + i] = i;
		var isum = 0;
		var inum = 0;
		for (t = Math.max(0, 0 - i); t < Math.min(a.length - i, a.length); t++) {
			isum += avar[t] * avar[t+i];
			inum ++;
		}
		gy[mid + i] = (isum / inum) / (amean * amean);
	}
	return [gx, gy];
}

// Normalize an array according to max
function normArray(a, max) {
	var na = new Array(a.length);
	aStats = getStats(a);
	for (var i = 0; i < a.length; i++) {
		na[i] = a[i] * max / aStats[2];
	}
	return na;
}

// Normalize an array according to first value
function normArrayFirst(a, max) {
	var na = new Array(a.length);
	for (var i = 0; i < a.length; i++) {
		na[i] = a[i] * max / a[0];
	}
	return na;
}

// Log the attributes of a PlotProfile
function printProfileFit(pf) {
	var logstring = "\n*** Profile Fit data ***\n";
	logstring += "Stack name: " + pf.pStackName + "\n";
	logstring += "Slice number: " + pf.pSliceNumber + "\n";
	logstring += "Slice label: " + pf.pSliceLabel + "\n";
	logstring += "Roi index: " + pf.pRoiNumber + "\n";
	logstring += "Roi name: " + pf.pRoiName + "\n";
	logstring += "X coordinates: " + printArraySample(pf.pCropX) + "\n";
	logstring += "Intensity values: " + printArraySample(pf.pCropY) + "\n";
	logstring += "Length (px):" + pf.pStats[0] +"\n";
	logstring += "Length (um): " + (pf.pStats[0] * pxSize) +"\n";
	logstring += "Min value: " + pf.pStats[1] + "\n";
	logstring += "Max value: " + pf.pStats[2] + "\n";
	logstring += "Mean intensity: " + pf.pStats[3] + "\n";
	logstring += "Standard deviation: " + pf.pStats[4] + "\n";
	logstring += "Autocorrelation X: " + printArraySample(pf.pAcX) + "\n";
	logstring += "Autocorrelation Y: " + printArraySample(pf.pAcY) + "\n";
	logstring += "Normalized autocorrelation Y: " + printArraySample(pf.pAcNY) + "\n";
	return logstring;
}


// Log first and last two elements of an array, and its length
function printArraySample(Array) {
	if (Array.length < 2) return "*too small*";
	var string = "[ " + Array[0] + ", " + Array[1] + ", ... , " + Array[Array.length-2] + ", " + Array[Array.length-1] + " ] (length "+ Array.length + ")";
	return string;
}

// Log a whole array
function printArrayFull(Array) {
	var string = "[ ";
	for (var i = 0; i < Array.length-1; i++) {
		string += Array[i] + "\n";
	}
	string += Array[Array.length-1] + " ]";
	return string;
}



// Take the ProfileFits array and returns all values for a given parameter as an array
function getAllValues(f, pfs) {
	var fa = new Array(pfs.length);
	for (var i = 0; i < fa.length; i++) {
		string = "fa[i] = pfs[i]." + f;
		eval(string);
	}
	return fa;
}

// Take the ProfileFits arrays and returns the min value for a given parameter across all ProfileFits
function getMinValue(f, pfs) {
	var fa = getAllValues(f, pfs);
	var min = fa[0];
	for (var i = 1; i < fa.length; i++) {
		if (fa[i] < min) min = fa[i];
	}
	return min;
}

// Take the ProfileFits arrays and returns the max value for a given parameter across all ProfileFits
function getMaxValue(f, pfs) {
	var fa = getAllValues(f, pfs);
	var max = fa[0];
	for (var i = 0; i < fa.length; i++) {
		if (fa[i] > max) max = fa[i];
	}
	return max;
}

// Take the ProfileFits arrays and returns the max length for a given parameter array across all ProfileFits
function getMaxLength(f, pfs) {
	var fa = getAllValues(f, pfs);
	var max = fa[0];
	for (var i = 0; i < fa.length; i++) {
		if (fa[i].length > max) max = fa[i].length;
	}
	return max;
}

// Define the 'ProfileFit' object for storing results
function ProfileFit(pStackName, pSliceNumber, pSliceLabel, pRoiNumber, pRoiName, pCropX, pCropY, pStats, pAcX, pAcY, pAcNY, pAcStats, pAc2pX, pAc2pY) {
	// string: source stack name
	this.pStackName = pStackName;
	// int: source slice number
	this.pSliceNumber = pSliceNumber;
	// string: source slice label
	this.pSliceLabel = pSliceLabel;
	// int: source ROI number
	this.pRoiNumber = pRoiNumber;
	// string: source ROI name
	this.pRoiName = pRoiName;

	// array: profile X (scaled) cropped to profileLength
	this.pCropX = pCropX;
	// array: profile Y cropped to profileLength
	this.pCropY = pCropY;
	// array: stats of the profile
	this.pStats = pStats;

	// array: autocorrelation X (scaled)
	this.pAcX = pAcX;
	// array: autocorrelation Y
	this.pAcY = pAcY;
	// array: autocorrelation Y normalized
	this.pAcNY = pAcNY;
	// array: stats of the autocorrelation
	this.pAcStats = pAcStats;
	// float: autocorrelation 2nd peak X
	this.pAc2pX = pAc2pX;
	// float: autocorrelation 2nd peak Y
	this.pAc2pY = pAc2pY;

}
